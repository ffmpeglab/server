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
  : "${DB_HOST:?DB_HOST missing from deploy/.env}"
  : "${DB_USER:?DB_USER missing from deploy/.env}"
  : "${DB_PASSWORD:?DB_PASSWORD missing from deploy/.env}"
  : "${DB_NAME:?DB_NAME missing from deploy/.env}"
}

secret_args() {
  local key
  while IFS='=' read -r key _; do
    case "$key" in ''|\#*) continue ;; esac
    # An empty value is not an absent one: the AWS SDK rejects an empty region.
    [ -n "${!key:-}" ] || continue
    printf -- '--set-string\nsecret.data.%s=%s\n' "$key" "${!key}"
  done < <(grep -vE '^\s*(#|$)' "$ROOT/deploy/.env")
}

install_chart() {
  local -a extra=("$@")
  mapfile -t args < <(secret_args)

  if [ -z "${S3_ENDPOINT:-}" ]; then
    echo "S3_ENDPOINT is empty: deploying without the file runner."
    echo "Renders will complete but their results will not be uploaded anywhere."
    extra+=(--set file.enabled=false)
  fi

  helm upgrade --install "$RELEASE" "$CHART" \
    --namespace "$NAMESPACE" --create-namespace \
    --set secret.create=true \
    "${args[@]}" "${extra[@]}"
}

# Not helm --wait: it holds the release lock for the whole timeout, so a failed
# deploy blocks the next attempt too.
wait_ready() {
  step "Waiting for pods"
  if ! kubectl rollout status -n "$NAMESPACE" deployment --timeout=5m; then
    echo
    kubectl get pods -n "$NAMESPACE"
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

  step "Using $(kubectl config current-context)"
  kubectl version -o json >/dev/null 2>&1 || die "cannot reach the cluster with the current kubeconfig"

  step "Installing the chart"
  # render and file exchange the rendered file through the document directory, so
  # on a cluster with more than one node it has to be ReadWriteMany. See
  # deploy/docs/architecture.md.
  local -a storage=()
  if [ -n "${DOCUMENT_STORAGE_CLASS:-}" ]; then
    storage+=(--set "documentDir.persistence.storageClass=$DOCUMENT_STORAGE_CLASS")
  fi
  if [ -n "${DOCUMENT_EXISTING_CLAIM:-}" ]; then
    storage+=(--set "documentDir.persistence.existingClaim=$DOCUMENT_EXISTING_CLAIM")
  fi
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
