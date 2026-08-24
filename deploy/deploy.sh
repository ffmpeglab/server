#!/usr/bin/env bash
#
# Deploys FFmpegLab into a Kubernetes cluster.
#
#   ./deploy/deploy.sh local              minikube, started if not running
#   ./deploy/deploy.sh on-prem            a cluster your kubeconfig already points at
#   ./deploy/deploy.sh local --destroy
#   ./deploy/deploy.sh on-prem --destroy

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly ROOT
readonly CHART="$ROOT/deploy/helm/ffmpeglab"
readonly RELEASE="${FFMPEGLAB_RELEASE:-ffmpeglab}"
readonly NAMESPACE="${FFMPEGLAB_NAMESPACE:-ffmpeglab}"
readonly ONPREM_VALUES="$ROOT/deploy/values-onprem.yaml"
ACCESS_MODE=ReadWriteOnce
CLAIM_CLASS=""

usage() {
  sed -n '3,8p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 2
}

die() { echo "error: $*" >&2; exit 1; }
step() { echo; echo "==> $*"; }

need() {
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null || die "$cmd is not installed"
  done
}

load_env() {
  [ -f "$ROOT/deploy/.env" ] || die "deploy/.env not found — copy deploy/.env.example and fill it in"
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/deploy/.env"
  set +a

  # Credentials come from Vault and only from Vault: the tenant record is the
  # acceptance criterion of the issue, and a path around it would just be
  # install.sh again.
  : "${VAULT_ADDR:?VAULT_ADDR missing from deploy/.env}"
  : "${VAULT_ROLE:?VAULT_ROLE missing from deploy/.env}"
  : "${TENANT_PATH:?TENANT_PATH missing from deploy/.env}"
}

# The operator reads the tenant record from Vault and writes the Secret the
# release consumes, so no credential passes through here.
install_vso_resources() {
  need envsubst
  export VSO_NAMESPACE="$NAMESPACE" VSO_RELEASE="$RELEASE"
  export VSO_METHOD="${VAULT_METHOD:-kubernetes}" VSO_MOUNT="${VAULT_MOUNT:-kubernetes}"
  export VSO_ROLE="$VAULT_ROLE" VSO_SECRET_MOUNT="${VAULT_SECRET_MOUNT:-secret}"
  export VSO_PATH="$TENANT_PATH" VSO_REFRESH="${VAULT_REFRESH:-60s}"

  kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
  envsubst < "$ROOT/deploy/vso/vault-secret.yaml" | kubectl apply -f -

  step "Waiting for the operator to write the Secret"
  kubectl wait --for=condition=SecretSynced --timeout=2m \
    -n "$NAMESPACE" vaultstaticsecret/"$RELEASE" \
    || die "the operator could not sync the Secret — check the Vault role and path"
}

# Everything in .env becomes a key of the Secret except what configures the
# deployment rather than the application.

# A tag is a moving name: pushing over it changes nothing in the pod spec, so
# Kubernetes never rolls. Deploying the digest a tag points at right now means a
# new image is a new pod spec, and the release records exactly what runs.
resolve_digest() {
  local tag="$1" digest
  digest=$(curl -sf --max-time 20 \
    "https://hub.docker.com/v2/repositories/ffmpeglab/server/tags/$tag" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["digest"])' 2>/dev/null) || true
  case "$digest" in
    sha256:*) echo "$digest" ;;
    *) die "cannot resolve ffmpeglab/server:$tag to a digest" ;;
  esac
}

# render hands the finished file to the file runner through the document
# directory, so both pods mount the same claim. Storage that only supports
# ReadWriteOnce works while both land on one node; more than one node needs
# ReadWriteMany, which no default StorageClass provides.
readonly RWX_PROVISIONERS='efs\.csi\.aws\.com|filestore\.csi\.storage\.gke\.io|file\.csi\.azure\.com|nfs|cephfs|glusterfs|quobyte|azure-file|portworx'

default_storage_class() {
  kubectl get storageclass -o json 2>/dev/null | python3 -c '
import json, sys
keys = ("storageclass.kubernetes.io/is-default-class",
        "storageclass.beta.kubernetes.io/is-default-class")
try:
    items = json.load(sys.stdin)["items"]
except Exception:
    sys.exit(0)
for i in items:
    ann = i.get("metadata", {}).get("annotations") or {}
    if any(ann.get(k) == "true" for k in keys):
        print(i["metadata"]["name"])
        break
'
}

list_storage_classes() {
  echo "Storage classes on this cluster:" >&2
  kubectl get storageclass --no-headers -o custom-columns=NAME:.metadata.name,PROVISIONER:.provisioner \
    2>/dev/null | sed 's/^/  /' >&2 || true
}

# What the claim will really ask for. The values can arrive from deploy/.env,
# from values-onprem.yaml or from the chart default, so render it and read the
# answer rather than guess at the precedence.
read_claim_spec() {
  local rendered
  rendered=$(helm template "$RELEASE" "$CHART" --namespace "$NAMESPACE" "$@" 2>/dev/null \
    | awk '/kind: PersistentVolumeClaim/{f=1} f{print} f&&/^---$/{exit}')
  ACCESS_MODE=$(printf '%s' "$rendered" | grep -oE 'ReadWrite[A-Za-z]+' | head -1)
  ACCESS_MODE="${ACCESS_MODE:-ReadWriteOnce}"
  CLAIM_CLASS=$(printf '%s' "$rendered" | awk '/storageClassName:/{print $2; exit}')
}

# Checks what the claim will ask for against what the cluster can actually give,
# so a mismatch fails here with a reason instead of leaving pods Pending.
preflight_storage() {
  step "Checking the document volume"

  if [ -n "${DOCUMENT_EXISTING_CLAIM:-}" ]; then
    kubectl get pvc -n "$NAMESPACE" "$DOCUMENT_EXISTING_CLAIM" >/dev/null 2>&1 \
      || die "DOCUMENT_EXISTING_CLAIM=$DOCUMENT_EXISTING_CLAIM does not exist in namespace $NAMESPACE"
    echo "Using the existing claim $DOCUMENT_EXISTING_CLAIM"
    return 0
  fi

  local class provisioner nodes
  class="$CLAIM_CLASS"
  if [ -n "$class" ]; then
    kubectl get storageclass "$class" >/dev/null 2>&1 || {
      list_storage_classes
      die "storage class \"$class\" does not exist on this cluster - it comes from deploy/.env or deploy/values-onprem.yaml"
    }
  else
    class=$(default_storage_class)
    [ -n "$class" ] || {
      list_storage_classes
      die "this cluster has no default StorageClass - name one in deploy/values-onprem.yaml or DOCUMENT_STORAGE_CLASS, or set DOCUMENT_EXISTING_CLAIM to use a volume you created yourself"
    }
  fi

  provisioner=$(kubectl get storageclass "$class" -o jsonpath='{.provisioner}' 2>/dev/null)
  echo "Storage class: $class ($provisioner), access mode $ACCESS_MODE"

  if [ "$ACCESS_MODE" = ReadWriteMany ] && ! printf '%s' "$provisioner" | grep -qiE "$RWX_PROVISIONERS"; then
    echo "warning: $provisioner is not known to provide ReadWriteMany - the claim may stay Pending" >&2
    echo "         set DOCUMENT_EXISTING_CLAIM to a volume backed by NFS, EFS or Filestore" >&2
  fi

  nodes=$(kubectl get nodes --no-headers 2>/dev/null | wc -l | tr -d ' ')
  if [ "$ACCESS_MODE" = ReadWriteOnce ] && [ "${nodes:-1}" -gt 1 ]; then
    echo "warning: this cluster has $nodes nodes - render and file must sit on the same one" >&2
    echo "         to hand files over. Pin both with a nodeSelector, as values-onprem.yaml does." >&2
  fi
}

# A volume can bind and still fail to attach - a block device carrying a
# ReadWriteMany claim cannot mount on two nodes at once, which leaves the pods in
# ContainerCreating with the reason only in their events, never in their logs.
report_stuck_pods() {
  local pods pod
  pods=$(kubectl get pods -n "$NAMESPACE" \
    -o jsonpath='{range .items[?(@.status.phase!="Running")]}{.metadata.name}{"\n"}{end}' 2>/dev/null)
  [ -n "$pods" ] || return 0

  while read -r pod; do
    [ -n "$pod" ] || continue
    local events
    events=$(kubectl get events -n "$NAMESPACE" --field-selector "involvedObject.name=$pod" \
      -o custom-columns=:message --no-headers 2>/dev/null \
      | grep -iE "multi-attach|failedmount|failedattach|volume|unable to attach" | tail -2)
    [ -n "$events" ] || continue
    echo
    echo "$pod cannot mount its volume:" >&2
    printf '%s\n' "$events" | sed 's/^/    /' >&2
    echo "  ReadWriteMany on block storage attaches to one node only. Use a claim backed" >&2
    echo "  by NFS, EFS or Filestore, or keep both pods on one node with ReadWriteOnce." >&2
  done <<< "$pods"
}

# Reported before pod logs: a Pending claim keeps its pods Pending, and Pending
# pods have no logs to show.
report_pending_claims() {
  local pending pvc
  pending=$(kubectl get pvc -n "$NAMESPACE" \
    -o jsonpath='{range .items[?(@.status.phase=="Pending")]}{.metadata.name}{"\n"}{end}' 2>/dev/null)
  [ -n "$pending" ] || return 0

  echo
  echo "A volume claim is Pending, so every pod that mounts it stays Pending:" >&2
  while read -r pvc; do
    [ -n "$pvc" ] || continue
    echo "  $pvc" >&2
    kubectl get events -n "$NAMESPACE" --field-selector "involvedObject.name=$pvc" \
      -o custom-columns=:message --no-headers 2>/dev/null | tail -3 | sed 's/^/    /' >&2
  done <<< "$pending"
  echo "  Most often the storage class cannot serve the requested access mode." >&2
  echo "  See DOCUMENT_ACCESS_MODE, DOCUMENT_STORAGE_CLASS and DOCUMENT_EXISTING_CLAIM in deploy/.env." >&2
}

install_chart() {
  local -a extra=("$@")

  if [ -n "${IMAGE_TAG:-}" ]; then
    local digest
    digest=$(resolve_digest "$IMAGE_TAG")
    echo "Image: $IMAGE_TAG is ${digest:0:19}..."
    extra+=(--set "image.digest=$digest")
  fi

  install_vso_resources
  extra+=(--set "existingSecret=$RELEASE-credentials")

  helm upgrade --install "$RELEASE" "$CHART" \
    --namespace "$NAMESPACE" --create-namespace \
    "${extra[@]}"
}

# Not helm --wait: it holds the release lock for the whole timeout, so a failed
# deploy blocks the next attempt too.
wait_ready() {
  step "Waiting for pods"
  if ! kubectl rollout status -n "$NAMESPACE" deployment --timeout=5m; then
    echo
    kubectl get pods -n "$NAMESPACE"
    report_pending_claims
    report_stuck_pods
    echo
    kubectl logs -n "$NAMESPACE" --tail=20 --all-containers \
      -l app.kubernetes.io/name=ffmpeglab 2>/dev/null | tail -30
    return 1
  fi
}

show_status() {
  step "Status"
  kubectl get pods -n "$NAMESPACE" -o wide
  echo
  kubectl get svc -n "$NAMESPACE"
  cat <<EOF

Reach the API:
  kubectl port-forward -n $NAMESPACE svc/$RELEASE-api 3000:3000
  curl http://localhost:3000/

Logs:
  kubectl logs -n $NAMESPACE -l app.kubernetes.io/component=render --tail=50
EOF
}

uninstall() {
  helm uninstall "$RELEASE" -n "$NAMESPACE" 2>/dev/null || true
  kubectl delete namespace "$NAMESPACE" --ignore-not-found
}

local_up() {
  need minikube kubectl helm docker
  load_env

  if minikube status >/dev/null 2>&1; then
    step "Using the running minikube"
  else
    step "Starting minikube"
    minikube start --memory="${MINIKUBE_MEMORY:-3000mb}" --cpus="${MINIKUBE_CPUS:-2}"
  fi
  kubectl config use-context minikube >/dev/null

  step "Installing the chart"
  # One node attaches a ReadWriteOnce volume to every pod on it, so render and
  # file still share the document directory without ReadWriteMany storage.
  install_chart --set 'documentDir.persistence.accessModes[0]=ReadWriteOnce'

  wait_ready
  show_status
}

local_down() {
  need minikube kubectl helm
  uninstall
  echo
  echo "The cluster is still running. Remove it with: minikube delete"
}

onprem_up() {
  need kubectl helm
  load_env

  local context
  context=$(kubectl config current-context 2>/dev/null) || true
  if [ -z "$context" ]; then
    echo "No kubectl context is selected. Available:" >&2
    kubectl config get-contexts -o name 2>/dev/null | sed 's/^/  /' >&2
    die "pick one with: kubectl config use-context <name>"
  fi

  step "Using $context"
  kubectl version -o json >/dev/null 2>&1 || die "cannot reach $context with the current kubeconfig"

  # The cluster's own storage class and the node its disk sits on belong in
  # values-onprem.yaml; deploy/.env overrides it where an operator needs to.
  local -a storage=()
  if [ -f "$ONPREM_VALUES" ]; then
    storage+=(-f "$ONPREM_VALUES")
    echo "Values: deploy/values-onprem.yaml"
  fi
  if [ -n "${DOCUMENT_ACCESS_MODE:-}" ]; then
    case "$DOCUMENT_ACCESS_MODE" in
      ReadWriteOnce|ReadWriteMany) ;;
      *) die "DOCUMENT_ACCESS_MODE must be ReadWriteOnce or ReadWriteMany, not $DOCUMENT_ACCESS_MODE" ;;
    esac
    storage+=(--set "documentDir.persistence.accessModes[0]=$DOCUMENT_ACCESS_MODE")
  fi
  if [ -n "${DOCUMENT_STORAGE_CLASS:-}" ]; then
    storage+=(--set "documentDir.persistence.storageClass=$DOCUMENT_STORAGE_CLASS")
  fi
  if [ -n "${DOCUMENT_EXISTING_CLAIM:-}" ]; then
    storage+=(--set "documentDir.persistence.existingClaim=$DOCUMENT_EXISTING_CLAIM")
  fi

  read_claim_spec "${storage[@]}"
  preflight_storage

  step "Installing the chart"
  install_chart "${storage[@]}"

  wait_ready
  show_status
}

onprem_down() {
  need kubectl helm
  uninstall
}

target="${1:-}"
action="${2:-}"
[ -n "$target" ] || usage

case "$target:$action" in
  local:)            local_up ;;
  local:--destroy)   local_down ;;
  on-prem:)          onprem_up ;;
  on-prem:--destroy) onprem_down ;;
  *)                 usage ;;
esac
