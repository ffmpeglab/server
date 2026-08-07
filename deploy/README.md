# deploy

Kubernetes deployment assets. Nothing outside this directory is touched, and
nothing here is required to run the project with Docker Compose.

```
deploy/
└── helm/ffmpeglab/   one release == one tenant
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
| `worker` | yes | render and file handling in one process |
| `file` | no | standalone file runner, see below |
| `logs` | yes | no filesystem access |

Render and file handling share a process on purpose. The render step writes its
output to the document directory and the file step reads it back from the same
path, so splitting them across pods would require shared storage. This chart
provisions none: the document directory is an `emptyDir`, sized by
`documentDir.sizeLimit`. Enable the standalone `file` component only if the
handoff stops going through the local filesystem.

## Running it locally

Needs `minikube`, `kubectl`, `helm`, `terraform` and the `vault` CLI, plus a
Supabase project to point at.

Give Docker at least 8 GB. A 4 GB Docker was not enough here — the minikube
container was OOM-killed with the metrics stack, Vault and one tenant running.

On minikube, end to end, against a real Supabase project:

```bash
minikube start --memory=6g --cpus=4

helm repo add hashicorp https://helm.releases.hashicorp.com
helm install vault hashicorp/vault -n vault --create-namespace -f deploy/vault/values.yaml
kubectl -n vault port-forward svc/vault 8200:8200 &

export VAULT_ADDR=http://127.0.0.1:8200
export VAULT_TOKEN=root
export TF_VAR_vault_token=$VAULT_TOKEN
vault secrets enable -path=tenants -version=2 kv

# one entry per tenant — see deploy/vault/README.md for the keys
vault kv put tenants/<project-ref> DB_HOST=... DB_PORT=6543 ...

terraform -chdir=deploy/terraform init
terraform -chdir=deploy/terraform apply -var-file=demo.tfvars
```

`demo.tfvars` shrinks the resource requests: the chart sizes a render worker for
real footage, which will not schedule on a small local cluster next to Vault.

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
  created.
- Vault here is dev mode — restarting the pod empties the registry, and the next
  apply will want to destroy every tenant. Re-run `vault secrets enable` and
  write the entries again.
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
