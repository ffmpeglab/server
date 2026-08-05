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

On minikube, end to end, against a real Supabase project:

```bash
minikube start

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
real footage, which will not schedule on a two-core Docker next to Vault.

Four things that will otherwise cost you an hour:

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
  apply will want to destroy every tenant.

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

## Not covered yet

Ingress, scale-to-zero for idle runners, and how tenant entries get written to
Vault in the first place. Tracked in
[#2](https://github.com/ffmpeglab/server/issues/2).
