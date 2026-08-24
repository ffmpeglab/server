# deploy

Kubernetes deployment for FFmpegLab Server. Nothing outside this directory is
touched, and none of it is required to run the project with Docker Compose.

```
deploy/
├── helm/ffmpeglab/      the application: API, render, file and log runners
├── vso/                 Vault Secrets Operator, and the shape of a tenant record
├── values-onprem.yaml   the storage class and nodes of the cluster you deploy to
└── docs/                architecture, deployment, development, troubleshooting
```

## Deploy

```bash
./deploy/deploy.sh local
```

`local` needs nothing prepared. It creates a three-node k3s cluster in Docker,
installs a dev Vault and the secrets operator, seeds a tenant record and deploys
from it — the same path production takes, with the registry standing in.

The record it seeds comes from `deploy/tenant.local.env` — copy the example next
to it — or from `deploy/.env` when that file is absent. With neither, the run
seeds placeholders: the Secret is still written and the pods still receive it,
they just have no database to reach.

The dev Vault holds everything in memory, so restarting Docker empties it. Run
the command again to seed it back.

```bash
cp deploy/.env.example deploy/.env   # Vault address, role and tenant path
./deploy/deploy.sh on-prem
```

`on-prem` uses the cluster your kubeconfig already points at and the Vault you
name in `deploy/.env`. Both install the same chart.

```bash
./deploy/deploy.sh local --destroy
./deploy/deploy.sh on-prem --destroy
```

The script calls Helm and kubectl; it does not reimplement them.
[docs/deployment.md](docs/deployment.md) shows the same steps by hand.

## On a release

Publishing a GitHub release runs `.github/workflows/deploy.yml`, which waits for
the image to appear and then runs `./deploy/deploy.sh on-prem` against the
cluster it is given. Prereleases are skipped, and one deploy runs at a time.

The runner holds no Vault credential: the operator authenticates as the cluster
and reads the record itself, so the only secret is `KUBECONFIG`. The Vault
address, the role and the tenant path are repository variables.

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

## Storage

render writes the finished file into the document directory and the file runner
reads it back from there, so both need the same volume.

`ReadWriteOnce` is enough: the volume binds to one node and the scheduler puts
both runners there. `deploy/values-onprem.yaml` pins them with a `nodeSelector`
where that has to be certain. `ReadWriteMany` is only for runners spread on
purpose, and this chart installs no storage provider of its own.

[docs/deployment.md](docs/deployment.md#the-document-volume) has the settings.

## Documentation

| File | Contents |
|------|----------|
| [docs/architecture.md](docs/architecture.md) | components, why one release is one instance |
| [docs/deployment.md](docs/deployment.md) | local and on-prem, by hand and by script |
| [docs/development.md](docs/development.md) | working on the chart, running a real render |
| [docs/troubleshooting.md](docs/troubleshooting.md) | failures worth recognising |
