# Deployment

## Prerequisites

| Tool | Needed for |
|------|-----------|
| kubectl | both |
| helm 3 | both |
| docker | local |
| minikube | local |

Plus a Postgres the cluster can reach. FFmpegLab does not deploy one.

Docker needs about 4 GB for a local cluster.

## Configuration

```bash
cp deploy/.env.example deploy/.env
```

`deploy/.env` is gitignored and is the only place you enter anything.

| Variable | Required | Who reads it | Example |
|----------|----------|--------------|---------|
| `DB_HOST` | yes | every component | `aws-1-eu-west-1.pooler.supabase.com` |
| `DB_PORT` | yes | every component | `6543` |
| `DB_USER` | yes | every component | `postgres.abcdefgh` |
| `DB_PASSWORD` | yes | every component | — |
| `DB_NAME` | yes | every component | `postgres` |
| `DB_MIGRATION_ENABLED` | no | api, on start | `true` on an empty database, then `false` |
| `IMAGE_TAG` | no | the deploy script | `latest`, `0.4`, `0.4.3` — empty keeps the chart's pin |
| `S3_ENDPOINT` | for uploads | file runner | `https://<ref>.storage.supabase.co/storage/v1/s3` |
| `S3_REGION` | with S3 | file runner | `eu-central-1` |
| `S3_ACCESS_KEY` | with S3 | file runner | from Storage → S3 Connection, not the anon key |
| `S3_SECRET_KEY` | with S3 | file runner | — |
| `S3_BUCKET_ID` | with S3 | file runner | `renders` |
| `DOCUMENT_STORAGE_CLASS` | multi-node | the PVC | a class that provides `ReadWriteMany` |
| `DOCUMENT_EXISTING_CLAIM` | multi-node | the PVC | an RWX claim you already have |

Everything non-empty becomes a key of one Kubernetes Secret, which every pod
reads through `envFrom`, except the last three rows and `IMAGE_TAG` — those
configure the deployment, not the application. Adding a variable the application understands needs no
change to the chart or the script.

Empty is not the same as absent: a blank `S3_REGION` reaches the AWS SDK as an
empty string and fails, so blank values are skipped rather than passed on.

Two variables decide whether the deployment comes up at all:

- `DB_HOST` must resolve from inside the cluster. A Supabase project has to be
  reached through its pooler host — `db.<ref>.supabase.co` has an IPv6 address
  and no A record, so nothing in a cluster can reach it.
- `DB_MIGRATION_ENABLED=true` on a database with no tables yet, and off
  afterwards. It maps to TypeORM `synchronize`, which will try to alter tables it
  does not own.

## Local

```bash
./deploy/deploy.sh local
```

By hand, which is what the script does:

```bash
minikube start --memory=3000mb --cpus=2

helm upgrade --install ffmpeglab deploy/helm/ffmpeglab \
  --namespace ffmpeglab --create-namespace \
  --set secret.create=true \
  --set-string secret.data.DB_HOST=... \
  --set-string secret.data.DB_USER=... \
  --set-string secret.data.DB_PASSWORD=... \
  --set-string secret.data.DB_NAME=... \
  --set 'documentDir.persistence.accessModes[0]=ReadWriteOnce'
```

## On-prem

Point your kubeconfig at the cluster, then:

```bash
kubectl config current-context
./deploy/deploy.sh on-prem
```

On a cluster with more than one node, render and file land on different nodes and
need shared storage:

```bash
# in deploy/.env
DOCUMENT_STORAGE_CLASS=<a ReadWriteMany class>
# or
DOCUMENT_EXISTING_CLAIM=<an existing RWX claim>
```

By hand:

```bash
helm upgrade --install ffmpeglab deploy/helm/ffmpeglab \
  --namespace ffmpeglab --create-namespace \
  --set secret.create=true \
  --set-string secret.data.DB_HOST=... \
  --set documentDir.persistence.storageClass=<class>
```

Where credentials come from Vault instead of `.env`, see [../vso/](../vso/) and
install with `--set existingSecret=<name>` rather than `secret.create=true`.

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

Four Deployments should be `1/1` — three if the file runner is off. A running pod
proves little on its own; [development.md](development.md) has a real render.

## Remove

```bash
./deploy/deploy.sh local --destroy    # or on-prem
minikube delete                       # the local cluster as well
```
