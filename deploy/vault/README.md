# vault

Vault holds the tenant registry that `../terraform` reads. One entry per
Supabase instance. Writing entries is out of scope here — this file only fixes
the shape they have to be in.

## Registry layout

- Mount: `tenants`, kv v2. Configurable with the `tenant_mount` variable.
- One secret per tenant at `tenants/<tenant-id>`.
- Flat key/value, all values strings. No nesting.

`<tenant-id>` identifies the tenant and is the only part of the entry that is
not passed to the application. Use the Supabase project ref — it is unique and
stable. It ends up in the namespace and release name, lowercased with anything
outside `[a-z0-9-]` replaced by `-` and truncated to 40 characters, so two
tenants whose ids differ only in case or punctuation would collide.

### Keys

| Key | Required | Notes |
|-----|----------|-------|
| `DB_HOST` | yes | Pooler host. The direct `db.<ref>.supabase.co` has no A record and is unreachable from most clusters |
| `DB_PORT` | yes | `6543` for transaction mode, `5432` for session mode |
| `DB_USER` | yes | `postgres.<ref>` on the pooler |
| `DB_PASSWORD` | yes | |
| `DB_NAME` | yes | `postgres` |
| `DB_MIGRATION_ENABLED` | no | `true` on first start so the tables get created |
| `S3_ENDPOINT` | for file work | Storage S3 endpoint |
| `S3_REGION` | for file work | |
| `S3_ACCESS_KEY` | for file work | S3 access key from Storage settings, not the anon or service_role JWT |
| `S3_SECRET_KEY` | for file work | |
| `S3_BUCKET_ID` | for file work | Bucket name |
| `DOCUMENT_DIRECTORY` | no | Defaults to `/tmp/ffmpeglab` |
| `MAX_UPLOAD_SIZE` | no | Upload limit for the TUS endpoint |
| `PIPELINES_API_ENABLED` | no | Turns on the pipelines API |

Every key in the entry is copied into the tenant's Kubernetes Secret as-is and
the chart passes it with `envFrom`. Nothing is renamed on the way, so a new
variable in the application means adding a key here and nothing else — the
table above is what the application happens to read today, not a schema the
reconciler enforces.

### Example

```bash
vault kv put tenants/abcdefghijklmnopqrst \
  DB_HOST=aws-0-eu-central-1.pooler.supabase.com \
  DB_PORT=6543 \
  DB_USER=postgres.abcdefghijklmnopqrst \
  DB_PASSWORD=... \
  DB_NAME=postgres \
  DB_MIGRATION_ENABLED=true \
  S3_ENDPOINT=https://abcdefghijklmnopqrst.storage.supabase.co/storage/v1/s3 \
  S3_REGION=eu-central-1 \
  S3_ACCESS_KEY=... \
  S3_SECRET_KEY=... \
  S3_BUCKET_ID=...
```

Writing that entry brings the tenant up on the next apply. Deleting it tears the
namespace, the Secret and the release down. An empty registry is a valid state.

## Where Vault runs

Outside the cluster. Nothing here installs or manages it — the deployment only
needs an address and a token that can read the registry, both supplied as
secrets to the deploy workflow.

Mount `tenants` as kv v2 if it does not exist yet:

```bash
vault secrets enable -path=tenants -version=2 kv
```
