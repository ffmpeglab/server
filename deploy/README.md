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

Ingress, the Vault-to-Secret controller, the Consul-driven reconciliation of the
tenant list, and scale-to-zero for idle runners. Tracked in
[#2](https://github.com/ffmpeglab/server/issues/2).
