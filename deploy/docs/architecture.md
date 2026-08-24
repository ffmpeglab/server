# Architecture

## Components

One container image, four roles, chosen by environment variable:

| Component | Variable | Does |
|-----------|----------|------|
| api | none | HTTP API on port 3000, the only component with a port |
| render | `IS_RENDER_RUNNER=true` | runs ffmpeg, writes output to the document directory |
| file | `IS_FILE_RUNNER=true` | reads that directory, uploads to object storage |
| logs | `IS_LOGS_RUNNER=true` | collects render logs, no filesystem access |

Work is passed through pgmq queues inside Postgres. The runners poll; there is no
message broker.

```
                 ┌─────────────────────── Postgres (Supabase) ───────────────────────┐
                 │  tables: render, api_key, log_piece, pipeline                      │
                 │  queues: pgmq.q_render, pgmq.q_file, pgmq.q_logs                   │
                 └───────────────────────────────────────────────────────────────────┘
                        ▲            │                  ▲                  ▲
      POST /renders     │            │ q_render         │ q_file           │ q_logs
      PUT  /renders/run │            ▼                  │                  │
   client ──────────▶ [api] ────▶ [render] ──────▶ [file] ───▶ S3      [logs]
                                     │   writes the file       reads it
                                     └────▶ document directory ─────┘
                                            (one volume, both pods)
```

Every arrow into Postgres is a poll: the runners have no inbound port and nothing
pushes to them. `result.url` is filled once the file runner has uploaded.

## What `deploy.sh` does

```
./deploy/deploy.sh local
        │
        ├─ 1. checks k3d, kubectl, helm, docker, python3 are installed
        ├─ 2. creates a three-node k3s cluster if there is none
        ├─ 3. installs a dev Vault, then the secrets operator
        ├─ 4. writes the policy, the role and the tenant record into Vault
        │        values from deploy/tenant.local.env, placeholders without it
        ├─ 5. applies VaultAuth and VaultStaticSecret
        │        waits for the operator to write the Secret
        ├─ 6. helm upgrade --install --set existingSecret=…
        │        image tag resolved to a digest
        ├─ 7. kubectl rollout status               waits for every Deployment
        └─ 8. prints pods, service, and how to reach the API

`on-prem` skips steps 2 to 4: the cluster, the operator and the Vault already
exist, and `deploy/.env` says where to find them.
```

`on-prem` is the same without steps 1 and 3: it uses the cluster your kubeconfig
already points at, and takes the storage class from `.env` instead of forcing
`ReadWriteOnce`.

## Why one release is one instance

The application binds one process to one database connection and one queue at
startup. It cannot serve two databases. Multi-tenancy therefore lives in the
deployment layer: another tenant means another release of the same chart, not a
configuration change inside a running one.

That is why the chart knows nothing about tenants. It deploys one instance and
takes its credentials from a Secret. Who creates that Secret, and how many
releases exist, is decided outside.

## Responsibility boundary

| Owns | What |
|------|------|
| this chart | Deployments, Service, storage, health checks |
| VSO | reading the tenant record from Vault, producing the Secret |
| the deploy script | applying the operator's resources and installing the chart |
| the platform | creating tenants and writing their records into Vault |
| whoever owns the cluster | the cluster itself, and storage that supports it |

FFmpegLab deployment never creates a tenant. It receives one.

## The document directory

render writes output where file reads it, the same `./tmp` bind mount the two
runners share in docker-compose. Across pods that means one volume mounted by
both.

A single-node cluster attaches a `ReadWriteOnce` volume to every pod on that
node, so nothing extra is needed. More than one node does not force
`ReadWriteMany`: a volume bound to a node carries that affinity, and the
scheduler puts every pod that mounts it on the same node. Measured on a
three-node k3s cluster — render and file landed together while api and logs,
which mount nothing, went elsewhere.

Pin both runners with a `nodeSelector` where that has to be certain, as
`values-onprem.yaml` does. `ReadWriteMany` is only required when the runners are
deliberately spread, and then the storage comes from whoever runs the cluster.

Turning persistence off does not work: each pod then gets its own `emptyDir` and
the file runner never sees what render produced. There is no fallback path —
object storage is where the result is uploaded to, not how it travels between the
two runners.

## Readiness and liveness

They answer different questions and must not point at the same check.

Readiness is "can this pod do its work". Failing it stops traffic reaching the
pod; nothing is restarted. Liveness is "is the process alive". Failing it kills
the pod.

A component that starts and waits for something — credentials, a dependency —
should fail readiness and pass liveness. The chart keeps a low failure threshold
for readiness and a high one for liveness so waiting is never mistaken for being
stuck.

Both currently point at `/`, which returns a greeting and knows nothing about
dependencies, so a waiting pod would still report ready. Set
`probes.readinessPath` once the application exposes an endpoint that reflects
whether it can actually serve.

## Portability

The chart carries no assumption about which cluster it runs on. Storage class,
resource sizing and which components are enabled are values, not templates, so
the same chart serves a laptop k3s, a managed cluster, or anything else that
consumes a Helm chart. The unit of reuse is the chart itself.
