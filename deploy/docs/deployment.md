# Deployment

## Prerequisites

| Tool | Needed for |
|------|-----------|
| kubectl | both |
| helm 3 | both |
| envsubst | with Vault |
| docker | local |
| minikube | local |

Plus a Postgres the cluster can reach — FFmpegLab does not deploy one — and the
Vault Secrets Operator installed in the cluster, see [../vso/](../vso/).

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
| `DOCUMENT_STORAGE_CLASS` | multi-node | a class providing `ReadWriteMany` |
| `DOCUMENT_EXISTING_CLAIM` | multi-node | an RWX claim you already have |

The tenant record's own fields are listed in [../vso/](../vso/).

### Without Vault

Leave `VAULT_ADDR` empty and put the tenant's values in `deploy/.env` directly —
`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and the `S3_*` set.
Every non-empty value becomes a key of a Secret the script creates.

This is for a local run only: the values pass through the machine doing the
deploy, which is the thing the operator exists to avoid.

`DB_HOST` must resolve from inside the cluster. A Supabase project has to be
reached through its pooler host — `db.<ref>.supabase.co` has an IPv6 address and
no A record.

## Local

```bash
./deploy/deploy.sh local
```

By hand, which is what the script does:

```bash
minikube start --memory=3000mb --cpus=2

VSO_NAMESPACE=ffmpeglab VSO_RELEASE=ffmpeglab \
VSO_METHOD=kubernetes VSO_MOUNT=kubernetes VSO_ROLE=ffmpeglab \
VSO_SECRET_MOUNT=secret VSO_PATH=tenants/<userId>/<projectId> VSO_REFRESH=60s \
  envsubst < deploy/vso/vault-secret.yaml | kubectl apply -f -

kubectl wait --for=condition=SecretSynced --timeout=2m \
  -n ffmpeglab vaultstaticsecret/ffmpeglab

helm upgrade --install ffmpeglab deploy/helm/ffmpeglab \
  --namespace ffmpeglab --create-namespace \
  --set existingSecret=ffmpeglab-credentials \
  --set 'documentDir.persistence.accessModes[0]=ReadWriteOnce'
```

## On-prem

Point your kubeconfig at the cluster, then:

```bash
kubectl config current-context
./deploy/deploy.sh on-prem
```

On a cluster with more than one node, render and file land on different nodes and
need shared storage:

```bash
# in deploy/.env
DOCUMENT_STORAGE_CLASS=<a ReadWriteMany class>
# or
DOCUMENT_EXISTING_CLAIM=<an existing RWX claim>
```

By hand:

```bash
helm upgrade --install ffmpeglab deploy/helm/ffmpeglab \
  --namespace ffmpeglab --create-namespace \
  --set existingSecret=ffmpeglab-credentials \
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
minikube delete                       # the local cluster as well
```
