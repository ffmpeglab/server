# deploy

Kubernetes deployment for FFmpegLab Server. Nothing outside this directory is
touched, and none of it is required to run the project with Docker Compose.

```
deploy/
├── helm/ffmpeglab/      the application: API, render and log runners
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

One container image, three roles, chosen by environment variable:

| Component | Variable | Does |
|-----------|----------|------|
| api | none | HTTP API on port 3000, the only component with a port |
| render | `IS_RENDER_RUNNER=true` | runs ffmpeg in a bubblewrap sandbox, uploads the result to object storage |
| logs | `IS_LOGS_RUNNER=true` | collects render logs |

Work passes through pgmq queues inside Postgres. The runners poll; there is no
broker and nothing pushes to them.

The application binds one database and one queue at startup, so it cannot serve
two tenants. Another tenant is another release of this chart, which is why the
chart knows nothing about tenants and simply takes its credentials from a Secret.

## Where this sits

```
  opentenant/platform                    ffmpeglab/server  ← you are here
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
                                            Kubernetes Secret ◀── Reloader watches
                                                   │ envFrom         │ rolls on change
                                                   ▼                 ▼
                                             api · render · logs
```

Nothing on the deploying side carries a credential: `deploy/.env` names the Vault
address, the role and the path to the record, and the operator reads the record
itself. The local run is the one exception, and only because it plays the part of
the platform — it writes the record into its own dev Vault first.

## What this deploys, and what it does not

One release is one FFmpegLab server instance: an API and two runners, all pointing at
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
the local run installs it itself. Both modes install
[Stakater Reloader](https://github.com/stakater/Reloader) unless one already runs
in the cluster, see [Secret rotation](#secret-rotation).

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
| `RELOADER_INSTALL` | no | `true` by default; `false` leaves Reloader to you |
| `RELOADER_NAMESPACE` | no | `reloader` by default |
| `RELOADER_CHART_VERSION` | no | `stakater/reloader` chart version, `2.2.19` by default |

The tenant record's own fields are listed in [vso/](vso/).

The record's `DB_HOST` must resolve from inside the cluster. A Supabase project
has to be reached through its pooler host — `db.<ref>.supabase.co` has an IPv6
address and no A record.

## Local

```bash
./deploy/deploy.sh local
```

This stands up everything the deployment needs and requires nothing prepared: a
three-node k3s cluster in Docker, a dev Vault, the secrets operator, Reloader,
and a tenant record written into Vault. Credentials still reach the pods through the
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
kubectl create clusterrolebinding vault-auth-delegator \
  --clusterrole=system:auth-delegator --serviceaccount=vault:vault
```

The operator, pointed at that Vault:

```bash
helm install vault-secrets-operator hashicorp/vault-secrets-operator \
  --namespace vault-secrets-operator-system --create-namespace \
  --set defaultVaultConnection.enabled=true \
  --set defaultVaultConnection.address=http://vault.vault.svc.cluster.local:8200 \
  --wait
```

Reloader, which is what rolls the pods when the Secret changes:

```bash
helm repo add stakater https://stakater.github.io/stakater-charts
helm upgrade --install reloader stakater/reloader --version 2.2.19 \
  --namespace reloader --create-namespace --wait
```

The auth method, the role and the record — the part the platform plays:

```bash
kubectl exec -i -n vault vault-0 -- \
  env VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN=root sh -s <<'SH'
vault auth enable kubernetes
vault write auth/kubernetes/config kubernetes_host=https://kubernetes.default.svc
vault policy write ffmpeglab - <<'HCL'
path "secret/data/tenants/*" { capabilities = ["read"] }
HCL
vault write auth/kubernetes/role/ffmpeglab \
  bound_service_account_names=ffmpeglab-vault \
  bound_service_account_namespaces=ffmpeglab policies=ffmpeglab ttl=1h
vault kv put -mount=secret tenants/local/demo DB_HOST='<host>' DB_PORT=5432 \
  DB_USER='<user>' DB_PASSWORD='<password>' DB_NAME=postgres
SH
```

Then the operator resources and the release as under
[On-prem → By hand](#by-hand-1), with `VSO_PATH=tenants/local/demo` and
without `-f deploy/values-onprem.yaml`.

## On-prem

A cluster that already exists, with storage and the operator in it. Point your
kubeconfig at it, replace the storage class and the render `nodeSelector` in
`deploy/values-onprem.yaml` with your cluster's, then:

```bash
kubectl config current-context
./deploy/deploy.sh on-prem
```

### By hand

Reloader as under [Local](#by-hand) if the cluster has none, then the operator
resources, then the release. Nothing here carries a credential —
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
and no ingress — a deliberate choice, so a cluster comes up with nothing the
chart needs.

Standing one up on a Linux host, controller and worker on the same machine:

```bash
curl -sSLf https://get.k0s.sh | sudo sh
sudo k0s install controller --single
sudo k0s start

sudo k0s kubeconfig admin > ~/.kube/config
```

Add machines with a join token from the controller:

```bash
sudo k0s token create --role=worker > worker.token   # on the controller
sudo k0s install worker --token-file worker.token    # on the new machine
sudo k0s start
```

`--single` marks the one machine schedulable. Without it, a controller keeps its
taint and nothing lands on it — including the storage provisioner:

```bash
kubectl taint node <node> node-role.kubernetes.io/control-plane:NoSchedule-
```

Then a storage class, since none exists. Any provisioner will do; this one needs
no configuration and suits a single machine:

```bash
kubectl apply -f https://raw.githubusercontent.com/rancher/local-path-provisioner/v0.0.30/deploy/local-path-storage.yaml
kubectl patch storageclass local-path \
  -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
```

Spread over several machines it has to be storage every node can reach — NFS,
Ceph, or the class your cluster already has. Name it in
`deploy/values-onprem.yaml`.

The secrets operator and a Vault the cluster can reach are the remaining two, and
[By hand](#by-hand-1) above installs both.

k3s and minikube bring a provisioner of their own, which is why neither shows
these steps — and why a green run on them says less about on-prem than it looks.

### The document volume

render works in the document directory and uploads the result from there itself,
so it is the only component that mounts the claim. `deploy.sh` asks for
`ReadWriteOnce`, which every storage class can bind.

More than one node does not force `ReadWriteMany`. A volume bound to a node
carries that affinity and the scheduler puts every render pod on that node. Pin
render with a `nodeSelector` where that has to be certain —
`deploy/values-onprem.yaml` does, alongside the cluster's storage class.

`ReadWriteMany` is only needed when render replicas are spread over several
nodes, and no default class provides it, so supply the volume yourself, backed
by NFS or CephFS:

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

### Render privileges

ffmpeg runs inside [bubblewrap](https://github.com/containers/bubblewrap), and
`entrypoint.sh` mounts a `proc` for it. Like `render-runner` in
`docker-compose.yml`, the render container gets `SYS_ADMIN` and unconfined
seccomp and AppArmor profiles; api and logs get none of that. A cluster whose
Pod Security admission enforces `baseline` or `restricted` on the namespace
rejects the render pod — label the namespace `privileged`, or override
`render.securityContext` if your runtime sandboxes differently.
`appArmorProfile` needs Kubernetes 1.30 or newer.

## Secret rotation

Credentials reach the pods through `envFrom`, which a process reads once at
start, so a rotated credential needs new pods:

1. Vault holds the new value.
2. The operator rewrites the Secret on its next refresh — VSO here
   (`VAULT_REFRESH`), ESO in the platform's cloud tenants.
3. Reloader sees the Secret change and rolls every Deployment that carries
   `reloader.stakater.com/auto: "true"` and reads that Secret.

Nothing runs `helm upgrade` for a rotation, and no credential value passes
through Helm values or Terraform state: the chart only names the Secret. The
annotation comes from `deploymentAnnotations` in the chart, merged with each
component's own `deploymentAnnotations`; a component can switch it off with
`reloader.stakater.com/auto: "false"`. It sits on the Deployment, not the pod
template, because that is where Reloader looks.

Without a running Reloader the annotation does nothing and pods keep the old
credential until they restart for another reason.

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
curl -i http://localhost:3000/api-json
```

Three Deployments should be `1/1`.

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

render uploads the result itself, and that is the last step. A render that
finishes without an upload means the tenant record has no working object storage.

### Editing the chart

```bash
helm lint deploy/helm/ffmpeglab
helm template test deploy/helm/ffmpeglab --set existingSecret=ffmpeglab-credentials
```

`env` passes plain variables to every component, `<component>.env` to one, for
example `--set env.S3_REGION=us-east-1`. `secret.create=true` with `secret.data`
writes the Secret from values for a cluster without an operator; the values then
live in the Helm release, so `existingSecret` is the normal path.

api's probes use `/api-json`. `api.probes.readinessPath` and `livenessPath`
override it separately: readiness should fail while the process cannot do its
work, so a pod waiting for credentials gets no traffic, and liveness stays
lenient (`livenessFailureThreshold`) so waiting is not mistaken for being stuck.

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

A stopped and started k3d cluster keeps its workloads, but the dev Vault comes
back empty; run `./deploy/deploy.sh local` again to seed it.

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

### Only render is Pending

render is the only pod mounting the document volume, so an unbound claim stops
exactly it while api and logs keep running:

```bash
kubectl get pvc -n ffmpeglab
kubectl describe pvc ffmpeglab-documents -n ffmpeglab | sed -n '/Events:/,$p'
```

`NodePath only supports ReadWriteOnce` or `no persistent volumes available` means
the class cannot serve the mode asked for. Set `DOCUMENT_ACCESS_MODE=ReadWriteOnce`,
or `DOCUMENT_EXISTING_CLAIM` for a volume backed by NFS or CephFS.

`no storage class is set` means the cluster has no default one — name it in
`DOCUMENT_STORAGE_CLASS`.

### Everything is Pending

```bash
kubectl describe node | grep -A5 "Allocated resources"
```

`Insufficient cpu` means the node is full. Each component requests 50m CPU and
128Mi memory by default.

### The rollout reports success but nothing works

A Deployment with one replica and `maxUnavailable: 1` never breaches its
availability budget, so `helm --wait` returns immediately with zero ready pods.
`deploy.sh` uses `kubectl rollout status` instead.

### The cluster looks empty in Lens

Restarting a local cluster hands out a new API server port. `kubectl` follows the
kubeconfig; GUI clients keep the old connection until reconnected.
