# deploy

Kubernetes deployment for FFmpegLab Server. Nothing outside this directory is
touched, and none of it is required to run the project with Docker Compose.

```
deploy/
├── helm/ffmpeglab/   the application: API, render, file and log runners
├── vso/              Vault Secrets Operator, for clusters that take credentials from Vault
├── vault/            the shape of a tenant record in Vault
└── docs/             architecture, deployment, development, troubleshooting
```

## Deploy

```bash
cp deploy/.env.example deploy/.env   # Vault address, role and tenant path
./deploy/deploy.sh local
```

```bash
./deploy/deploy.sh on-prem
```

`local` starts minikube if it is not running. `on-prem` uses the cluster your
kubeconfig already points at. Both install the same chart.

```bash
./deploy/deploy.sh local --destroy
./deploy/deploy.sh on-prem --destroy
```

The script calls Helm and kubectl; it does not reimplement them.
[docs/deployment.md](docs/deployment.md) shows the same steps by hand.

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

`deploy/.env` holds no credentials — only the Vault address, the role and the
path to the tenant record.

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

| Cluster | What to use |
|---------|-------------|
| minikube | one `ReadWriteOnce` claim — every pod lands on the single node |
| one node | the same |
| more than one node | a `ReadWriteMany` StorageClass, or an existing RWX claim |

Set `DOCUMENT_STORAGE_CLASS` or `DOCUMENT_EXISTING_CLAIM` in `deploy/.env` for
the last case. This chart installs no storage provider of its own — NFS, Ceph,
Filestore or anything else is supplied by whoever runs the cluster.

## Documentation

| File | Contents |
|------|----------|
| [docs/architecture.md](docs/architecture.md) | components, why one release is one instance |
| [docs/deployment.md](docs/deployment.md) | local and on-prem, by hand and by script |
| [docs/development.md](docs/development.md) | working on the chart, running a real render |
| [docs/troubleshooting.md](docs/troubleshooting.md) | failures worth recognising |
