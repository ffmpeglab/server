# deploy

Kubernetes deployment for FFmpegLab Server. Nothing outside this directory is
touched, and none of it is required to run the project with Docker Compose.

```
deploy/
├── helm/ffmpeglab/      the application: API, render, file and log runners
├── vso/                 Vault Secrets Operator, and the shape of a tenant record
└── values-onprem.yaml   the storage class and nodes of the cluster you deploy to
```

## Deploy

```bash
./deploy/deploy.sh local     # k3s in Docker, with a Vault and the operator
./deploy/deploy.sh on-prem   # the cluster your kubeconfig points at
```

Both install the same chart, and `--destroy` removes it. What each one needs is
under [Local](#local) and [On-prem](#on-prem) below.

## What runs

One container image, four roles, chosen by environment variable:

| Component | Variable | Does |
|-----------|----------|------|
| api | none | HTTP API on port 3000, the only component with a port |
| render | `IS_RENDER_RUNNER=true` | runs ffmpeg, writes output to the document directory |
| file | `IS_FILE_RUNNER=true` | reads that directory, uploads to object storage |
| logs | `IS_LOGS_RUNNER=true` | collects render logs |

Work passes through pgmq queues inside Postgres. The runners poll; there is no
broker and nothing pushes to them.

The application binds one database and one queue at startup, so it cannot serve
two tenants. Another tenant is another release of this chart, which is why the
chart knows nothing about tenants and simply takes its credentials from a Secret.

## Where this sits

```
  ffmpeglab/platform                     ffmpeglab/server  ← you are here
  ──────────────────                     ────────────────
  creates tenants                        deploys the application
  writes their records into Vault        into a cluster that already exists
  provisions cloud clusters
           │                                      │
           │  tenant record                       │  helm upgrade --install
           ▼                                      ▼
        ┌──────────┐   VaultStaticSecret   ┌──────────────────┐
        │  Vault   │ ◀──────────────────── │  VSO in-cluster  │
        └──────────┘   reads at runtime    └──────────────────┘
                                                   │ writes
                                                   ▼
                                            Kubernetes Secret
                                                   │ envFrom
                                                   ▼
                                      api · render · file · logs
```

Nothing on the deploying side carries a credential: `deploy/.env` names the Vault
address, the role and the path to the record, and the operator reads the record
itself. The local run is the one exception, and only because it plays the part of
the platform — it writes the record into its own dev Vault first.

## What this deploys, and what it does not

One release is one FFmpegLab instance: an API and three runners, all pointing at
one Postgres and one object store.

Credentials come from Vault and only from Vault: the operator reads the tenant
record and writes the Secret the release consumes. See [vso/](vso/).

It does **not** deploy Postgres, object storage or Supabase, and it does not
create or remove tenants. The platform writes tenant records; this repository
reads them.

Cloud provisioning is not here either. Creating a cluster belongs to whoever owns
the cloud account; this chart installs into a cluster that already exists.

## On a release

Publishing a GitHub release runs `.github/workflows/deploy.yml`, which waits for
the image to appear and then runs `./deploy/deploy.sh on-prem` against the
cluster it is given. Prereleases are skipped, and one deploy runs at a time.

The runner holds no Vault credential: the operator authenticates as the cluster
and reads the record itself, so the only secret is `KUBECONFIG`. The Vault
address, the role and the tenant path are repository variables.

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
also needs the Vault Secrets Operator in the cluster, see [vso/](vso/);
the local run installs it itself.

On-prem targets any conformant cluster — k0s, kubeadm, MicroK8s, a managed one.
The chart needs no change between them, but their defaults differ in what they
give you for free: see [A bare cluster](#a-bare-cluster).

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

The tenant record's own fields are listed in [vso/](vso/).

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

## On-prem

A cluster that already exists, with storage and the operator in it. Point your
kubeconfig at it, then:

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

### A bare cluster

This is the honest on-prem starting point. k0s and kubeadm ship no storage class
and no ingress — a deliberate choice. Two things bite before
the chart is reached, both measured on k0s v1.35.7:

```bash

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

Four Deployments should be `1/1`.

A running pod proves the process started, not that ffmpeg works. `example.sh` in
the repository root submits a render, polls it and prints the result. It needs an
API key, and there is no signup endpoint, so insert one into the tenant's
database — `date` is NOT NULL and has no default:

```sql
insert into api_key (title, apikey, user_id, data, date)
values ('local', 'ffmpeglab_sk_local', gen_random_uuid(), '{}', now());
```

```bash
kubectl port-forward -n ffmpeglab svc/ffmpeglab-api 3000:3000 &
API_HOST=http://localhost:3000 API_KEY=ffmpeglab_sk_local bash example.sh

kubectl logs -n ffmpeglab -l app.kubernetes.io/component=render -f
```

The file runner uploads the result, and that is the last step. A render that
finishes without an upload means that component is not running or has no storage
configured.

### Editing the chart

```bash
helm lint deploy/helm/ffmpeglab
helm template test deploy/helm/ffmpeglab --set existingSecret=ffmpeglab-credentials
```

**Bump `version` in `Chart.yaml` when you change it.** Helm itself does not care,
but anything driving it declaratively — Argo CD, Flux, Terraform's `helm_release`
— compares chart versions and reports no changes without a bump.

## Stopping and removing

The release, leaving the cluster alone:

```bash
./deploy/deploy.sh local --destroy    # or on-prem
```

The local cluster, keeping it for next time:

```bash
k3d cluster stop ffmpeglab
k3d cluster start ffmpeglab
```

Or for good:

```bash
k3d cluster delete ffmpeglab
```

A k0s cluster run in Docker is a container and a volume:

```bash
docker stop k0s          # keeps everything
docker start k0s

docker rm -f k0s         # for good
docker volume rm k0s-data
```

Verified across a stop and start of k0s: the cluster, its namespaces and every
running workload come back. **The dev Vault does not** — it holds its data in
memory, so the record, the policy and the role are gone. Run
`./deploy/deploy.sh local` again, or the seeding block above, to write them back.

## When something is wrong

```bash
kubectl get pods -n ffmpeglab
kubectl describe pod -n ffmpeglab <pod>
kubectl logs -n ffmpeglab <pod> --tail=50
kubectl get events -n ffmpeglab --sort-by=.lastTimestamp | tail -20
```

### Pods stay in Init

The init container waits for `DB_HOST` to resolve — the name is wrong, or cluster
DNS cannot answer for it:

```bash
kubectl logs -n ffmpeglab <pod> -c wait-for-dns
```

A Supabase project answers only through its pooler host. `db.<ref>.supabase.co`
has an IPv6 address and no A record, so nothing in a cluster reaches it.

### Only render and file are Pending

Those two are the only pods mounting the document volume, so an unbound claim
stops exactly them while api and logs keep running:

```bash
kubectl get pvc -n ffmpeglab
kubectl describe pvc ffmpeglab-documents -n ffmpeglab | sed -n '/Events:/,$p'
```

`NodePath only supports ReadWriteOnce` or `no persistent volumes available` means
the class cannot serve the mode asked for. Set `DOCUMENT_ACCESS_MODE=ReadWriteOnce`,
or `DOCUMENT_EXISTING_CLAIM` for a volume backed by NFS, EFS or Filestore.

`no storage class is set` means the cluster has no default one — name it in
`DOCUMENT_STORAGE_CLASS`.

### Everything is Pending

```bash
kubectl describe node | grep -A5 "Allocated resources"
```

`Insufficient cpu` means the node is full. Three instances of four components fit
on a two vCPU node with about 500m to spare; a fourth does not.

### The rollout reports success but nothing works

A Deployment with one replica and `maxUnavailable: 1` never breaches its
availability budget, so `helm --wait` returns immediately with zero ready pods.
`deploy.sh` uses `kubectl rollout status` instead.

### The cluster looks empty in Lens

Restarting a local cluster hands out a new API server port. `kubectl` follows the
kubeconfig; GUI clients keep the old connection until reconnected.

