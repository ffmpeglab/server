# Deployment

## Prerequisites

| Tool | Needed for |
|------|-----------|
| kubectl | both |
| helm 3 | both |
| envsubst | with Vault |
| docker | local |
| k3d | local |
| python3 | local |

Plus a Postgres the cluster can reach — FFmpegLab does not deploy one. On-prem
also needs the Vault Secrets Operator in the cluster, see [../vso/](../vso/);
the local run installs it itself.

Docker needs about 4 GB for a local cluster.

## Configuration

```bash
cp deploy/.env.example deploy/.env
```

Credentials are not entered here. Vault holds the tenant record and the operator
writes it into the cluster; `deploy/.env` only says where to look:

| Variable | Required | What it is |
|----------|----------|------------|
| `VAULT_ADDR` | yes | the Vault the operator reads from |
| `VAULT_ROLE` | yes | the role bound to this cluster's service account |
| `TENANT_PATH` | yes | `tenants/<userId>/<projectId>` |
| `VAULT_METHOD` | no | `kubernetes` by default, `jwt` where Vault cannot reach the cluster |
| `VAULT_MOUNT` | no | auth mount, matches the method |
| `VAULT_SECRET_MOUNT` | no | kv mount, `secret` by default |
| `VAULT_REFRESH` | no | how often the operator re-reads, `60s` by default |
| `IMAGE_TAG` | no | resolved to a digest before install |
| `DOCUMENT_ACCESS_MODE` | no | `ReadWriteOnce` by default, `ReadWriteMany` for several nodes |
| `DOCUMENT_STORAGE_CLASS` | no | the cluster default when empty |
| `DOCUMENT_EXISTING_CLAIM` | multi-node | a claim you already have; overrides the two above |

The tenant record's own fields are listed in [../vso/](../vso/).

The record's `DB_HOST` must resolve from inside the cluster. A Supabase project
has to be reached through its pooler host — `db.<ref>.supabase.co` has an IPv6
address and no A record.

## Local

```bash
./deploy/deploy.sh local
```

This stands up everything the deployment needs and requires nothing prepared: a
three-node k3s cluster in Docker, a dev Vault, the secrets operator, and a
tenant record written into Vault. Credentials still reach the pods through the
operator, so the local run exercises the same path as a real one.

The record's values come from `deploy/tenant.local.env`, or from `deploy/.env`
when that file is absent — everything in it except the settings that configure
the deployment itself. Without either the run seeds placeholders: the operator
still syncs the Secret and the pods still receive it, but they stop waiting for
a database that does not exist.

The dev Vault keeps everything in memory. Restarting Docker empties it, so run
`./deploy/deploy.sh local` again to seed it back.

`LOCAL_CLUSTER=minikube` keeps the older target. It installs neither Vault nor
the operator, so it only works against a cluster where both already exist.

### By hand

The cluster. Traefik is disabled because the chart has no Ingress:

```bash
k3d cluster create ffmpeglab --agents 2 \
  --k3s-arg "--disable=traefik@server:*"
```

Vault before the operator — the operator checks its default connection on
install and never becomes ready without something to connect to:

```bash
helm repo add hashicorp https://helm.releases.hashicorp.com

helm install vault hashicorp/vault \
  --namespace vault --create-namespace \
  --set server.dev.enabled=true \
  --set server.dev.devRootToken=root \
  --set injector.enabled=false --wait

kubectl wait --for=condition=Ready pod/vault-0 -n vault --timeout=3m

# Vault verifies the pod's token with the cluster, which needs this
kubectl create clusterrolebinding vault-auth-delegator \
  --clusterrole=system:auth-delegator \
  --serviceaccount=vault:vault

helm install vault-secrets-operator hashicorp/vault-secrets-operator \
  --namespace vault-secrets-operator-system --create-namespace \
  --set defaultVaultConnection.enabled=true \
  --set defaultVaultConnection.address=http://vault.vault.svc.cluster.local:8200 \
  --wait
```

The part the platform plays in production — an auth method, a policy, a role and
the tenant's record:

```bash
kubectl exec -i -n vault vault-0 -- \
  env VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN=root sh <<'EOF'
vault auth enable kubernetes
vault write auth/kubernetes/config kubernetes_host=https://kubernetes.default.svc

vault policy write ffmpeglab - <<POLICY
path "secret/data/tenants/*"     { capabilities = ["read"] }
path "secret/metadata/tenants/*" { capabilities = ["read", "list"] }
POLICY

vault write auth/kubernetes/role/ffmpeglab \
  bound_service_account_names=ffmpeglab-vault \
  bound_service_account_namespaces=ffmpeglab \
  policies=ffmpeglab ttl=1h

vault kv put -mount=secret tenants/local/demo \
  DB_HOST=<host> DB_PORT=5432 DB_USER=<user> DB_PASSWORD=<password> DB_NAME=postgres
EOF
```

Then the same two steps on-prem takes, below.

## On-prem

Point your kubeconfig at the cluster, then:

```bash
kubectl config current-context
./deploy/deploy.sh on-prem
```

### By hand

The operator resources, then the release. Nothing here carries a credential —
`vault-secret.yaml` holds a reference, and the operator does the reading:

```bash
VSO_NAMESPACE=ffmpeglab VSO_RELEASE=ffmpeglab \
VSO_METHOD=kubernetes VSO_MOUNT=kubernetes VSO_ROLE=ffmpeglab \
VSO_SECRET_MOUNT=secret VSO_PATH=tenants/<userId>/<projectId> VSO_REFRESH=60s \
  envsubst < deploy/vso/vault-secret.yaml | kubectl apply -f -

kubectl wait --for=condition=SecretSynced --timeout=2m \
  -n ffmpeglab vaultstaticsecret/ffmpeglab

helm upgrade --install ffmpeglab deploy/helm/ffmpeglab \
  --namespace ffmpeglab --create-namespace \
  -f deploy/values-onprem.yaml \
  --set existingSecret=ffmpeglab-credentials \
  --set image.digest=<sha256:…>
```

### The document volume

render writes the finished file into the document directory and the file runner
reads it back, so both mount one claim. `deploy.sh` asks for `ReadWriteOnce`,
which every storage class can bind and which both pods share while they run on
the same node.

More than one node does not force `ReadWriteMany`. A volume bound to a node
carries that affinity and the scheduler puts every pod mounting it on that node,
so the two runners land together on their own. Pin them with a `nodeSelector`
where that has to be certain — `deploy/values-onprem.yaml` does, alongside the
cluster's storage class.

`ReadWriteMany` is only needed when the runners are spread deliberately, and no
default class provides it, so supply the volume yourself — NFS, EFS or Filestore:

```bash
# in deploy/.env
DOCUMENT_EXISTING_CLAIM=<a claim backed by RWX storage>
# or, if a class on the cluster does provide RWX
DOCUMENT_ACCESS_MODE=ReadWriteMany
DOCUMENT_STORAGE_CLASS=<that class>
```

Before installing, `deploy.sh` checks that the class exists, that the cluster has
a default one when none is named, and warns when the provisioner is not known to
serve the mode being asked for.

By hand:

```bash
helm upgrade --install ffmpeglab deploy/helm/ffmpeglab \
  --namespace ffmpeglab --create-namespace \
  --set existingSecret=ffmpeglab-credentials \
  --set documentDir.persistence.accessModes[0]=ReadWriteOnce \
  --set documentDir.persistence.storageClass=<class>
```

## Image versions

`IMAGE_TAG` is resolved to a digest before the release is installed:

```
Image: latest is sha256:fd35bf28f9b1...
```

A tag is a moving name. Pushing over it leaves the pod spec unchanged, so
Kubernetes never rolls and different nodes can end up running different builds.
Deploying the digest the tag points at right now means a rebuilt image is a new
pod spec, the rollout happens on its own, and the release records exactly what is
running.

```bash
kubectl get deploy -n ffmpeglab \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.template.spec.containers[0].image}{"\n"}{end}'
```

Rolling back is redeploying the previous digest: set `IMAGE_TAG` to the version
you want, or pin `image.digest` in the chart.

## Verify

```bash
kubectl get nodes
kubectl get pods -n ffmpeglab
kubectl get deployments -n ffmpeglab
kubectl get svc -n ffmpeglab

kubectl port-forward -n ffmpeglab svc/ffmpeglab-api 3000:3000 &
curl -i http://localhost:3000/
```

Four Deployments should be `1/1` — three if the file runner is off. A running pod
proves little on its own; [development.md](development.md) has a real render.

## Remove

```bash
./deploy/deploy.sh local --destroy    # or on-prem
k3d cluster delete ffmpeglab          # the local cluster as well
```
