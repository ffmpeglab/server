# deploy

Kubernetes deployment assets. Nothing outside this directory is touched, and
nothing here is required to run the project with Docker Compose.

```
deploy/
├── helm/ffmpeglab/     one release == one tenant
├── terraform/          reads the Vault registry, keeps one release per tenant
├── terraform/gke/      the cluster itself
└── vault/              the registry format
```

## Model

A tenant is one Supabase instance. The application binds a process to a single
database connection and a single queue at startup, so one process serves exactly
one tenant — multi-tenancy therefore lives at the deployment layer, not in the
code. Adding a tenant means installing another release of this chart.

Supabase is never deployed by this chart. Each tenant runs its own instance
elsewhere, and the chart only receives its connection details.

```
Vault (tenant list)  ->  one Helm release per tenant  ->  that tenant's Supabase
```

## Components

| Component | Enabled by default | Notes |
|-----------|--------------------|-------|
| `api` | yes | HTTP service, the only component with a port |
| `render` | yes | runs ffmpeg, writes to the document directory |
| `file` | yes | reads from the same directory, uploads to storage |
| `logs` | yes | no filesystem access |
| `worker` | no | render and file in one process, for clusters without shared storage |

Render and file are separate deployments, as in docker-compose, and they hand
the output over through the document directory. That means both mount the same
volume, so it has to be `ReadWriteMany`.

Where no such storage exists — GKE's default class is `ReadWriteOnce` — use the
combined `worker` instead and turn `render` and `file` off. One process does both
steps and the directory becomes a private `emptyDir`.

## Running it locally

Needs `minikube`, `kubectl`, `helm`, `terraform` and the `vault` CLI, a Vault to
read the registry from, and a Supabase project to point at.

Give Docker at least 8 GB. A 4 GB Docker was not enough here — the minikube
container was OOM-killed with the metrics stack and one tenant running.

```bash
minikube start --memory=6g --cpus=4

export VAULT_ADDR=https://<your-vault>
export VAULT_TOKEN=<token that can read tenants/>
export TF_VAR_vault_token=$VAULT_TOKEN

# one entry per tenant — see deploy/vault/README.md for the keys
vault kv put tenants/<project-ref> DB_HOST=... DB_PORT=6543 ...

terraform -chdir=deploy/terraform init
terraform -chdir=deploy/terraform apply -var-file=demo.tfvars
```

For a cluster in Google Cloud rather than minikube, see
[terraform/gke/](terraform/gke/README.md) — including why the chart runs the
combined worker there instead of split runners.

`demo.tfvars` shrinks the resource requests: the chart sizes a render worker for
real footage, which will not schedule on a small local cluster.

Things that will otherwise cost you an hour:

- **Use the pooler host**, not `db.<ref>.supabase.co` — the direct one resolves to
  IPv6 only and is unreachable from the cluster. Port `6543` is transaction mode,
  `5432` session mode, and session mode caps a project at 15 connections.
- **The queues must not already exist.** `nestjs-pgmq` calls `pgmq.create` on
  every boot and pgmq answers `sequence pgmq.q_render_msg_id_seq is already a
  member of extension "pgmq"`, so the pods crash-loop. Against a project that has
  been used before, drop them first:
  `select pgmq.drop_queue('render'), pgmq.drop_queue('logs'), pgmq.drop_queue('file');`
- **Set `DB_MIGRATION_ENABLED=true`** in the entry on first run so the tables get
  created — `render`, `api_key`, `log_piece` and `pipeline`. It maps to TypeORM
  `synchronize`, not to the files under `src/migrations`.
- **Editing the chart? Bump `version` in `Chart.yaml`.** `helm_release` compares
  chart versions, so without it Terraform reports no changes and your edit never
  reaches the cluster.
- `minikube stop` hands out a new API server port on the next start. `kubectl`
  follows along, GUI clients like Lens keep the old connection and show an empty
  cluster until reconnected.

## Configuration

Environment variable names are not hardcoded in the templates. Everything under
`env` (shared) and `<component>.env` (per component) is passed through verbatim,
so renaming a variable in the application is a change to `values.yaml` alone.
What each variable means is documented in the repository root, not here.

Credentials are expected to arrive as a Kubernetes Secret produced from Vault by
an external controller, referenced with `existingSecret` and mounted with
`envFrom`. The `secret.create` block exists for local testing only.

## Install

```bash
helm install <tenant> deploy/helm/ffmpeglab \
  --namespace ffmpeglab-<tenant> --create-namespace \
  --set tenant.name=<tenant> \
  --set existingSecret=<tenant>-supabase \
  --set env.DB_PORT=5432
```

Verify:

```bash
kubectl -n ffmpeglab-<tenant> get pods
kubectl -n ffmpeglab-<tenant> port-forward svc/<tenant>-ffmpeglab-api 3000:3000
curl http://localhost:3000/
```

Render the manifests without installing:

```bash
helm template <tenant> deploy/helm/ffmpeglab --set tenant.name=<tenant>
```

## Running a real render

`example.sh` in the repository root creates a render, queues it and polls for the
result. Two things it needs first.

An API key — there is no signup endpoint, so insert one into the tenant's
database:

```sql
insert into api_key (title, apikey, user_id, data)
values ('local', 'ffmpeglab_sk_...', gen_random_uuid(), '{}');
```

And a different `API_HOST`: the script assigns it on its first line, so an
environment variable will not override it.

From inside the cluster, reaching the API by service name. The server image
already carries `curl`, so no extra image is pulled:

```bash
sed 's|^API_HOST=.*|API_HOST=http://<tenant>-ffmpeglab-api:3000|' example.sh | \
kubectl -n ffmpeglab-<tenant> run example --rm -i --restart=Never \
  --image=ffmpeglab/server:<tag> --env="API_KEY=<key>" --command -- sh -s
```

Or from your machine, through a forwarded port:

```bash
kubectl -n ffmpeglab-<tenant> port-forward svc/<tenant>-ffmpeglab-api 3000:3000 &
sed 's|^API_HOST=.*|API_HOST=http://localhost:3000|' example.sh > /tmp/example.sh
API_KEY=<key> bash /tmp/example.sh
```

A render takes around half a minute, and the script only sleeps 3 and 5 seconds
between polls — its last line usually still says `rendering`. Read the status
again to see it finish:

```bash
curl -s -H "Authorization: Bearer <key>" http://localhost:3000/renders/<id>
```

`status` reaching `done` means the render ran. `result` is filled in by the file
runner after it uploads, so an empty `result` with `done` means the upload has
not happened — check the `file` pod and the S3 settings in the tenant's entry.

## Not covered yet

Ingress, scale-to-zero for idle runners, and how tenant entries get written to
Vault in the first place. Tracked in
[#2](https://github.com/ffmpeglab/server/issues/2).
