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
        ├─ 1. checks minikube, kubectl, helm, docker are installed
        ├─ 2. reads deploy/.env                    ← you fill this in
        ├─ 3. starts minikube if it is not running
        ├─ 4. helm upgrade --install
        │        every non-empty variable from .env → keys of one Secret
        │        S3_ENDPOINT empty → the file runner is not deployed
        │        accessModes = ReadWriteOnce       (single node)
        ├─ 5. kubectl rollout status               waits for every Deployment
        └─ 6. prints pods, service, and how to reach the API
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
runners share in docker-compose. Across pods that means the same volume in both,
which needs `ReadWriteMany`.

A single-node cluster attaches a `ReadWriteOnce` volume to every pod on that
node, so minikube needs nothing extra. With more than one node the two runners
land apart and the claim has to be `ReadWriteMany`, supplied by whoever runs the
cluster.

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
the same chart serves minikube, a managed cluster, or anything else that
consumes a Helm chart. The unit of reuse is the chart itself.
