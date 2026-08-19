# vault

Vault holds the tenant registry that `../terraform` reads. One entry per
Supabase instance. Writing entries is out of scope here — this file only fixes
the shape they have to be in.

## Registry layout

Written by the platform service, not by this repository. Reading it is all the
reconciler does.

- Mount `secret`, kv v2.
- One secret per tenant at `tenants/<userId>/<projectId>`, so the listing walks
  two levels.
- The record sits one level down, under `data`.

### Fields the reconciler uses

| Key | Notes |
|-----|-------|
| `ffmpeglabStatus` | `on` or `off`. Anything not `on` is torn down — this is the switch behind `PUT /platform/tenant/:projectId/:status` |
| `DB_HOST` | Pooler host, built by the platform as `aws-1-<region>.pooler.supabase.com` |
| `DB_PORT` | |
| `DB_USER` | `postgres.<projectId>` |
| `DB_PASSWORD` | |
| `DB_NAME` | |

Everything in the record is copied into the tenant's Secret as-is, so a field
added by the platform reaches the pods without a change here. The nested `db`
object duplicates the flat `DB_*` keys; the application reads the flat ones.

### No object storage yet

The record carries no `S3_*` keys, so the file runner has nowhere to upload and
renders stop at `done` with an empty `result`. Until the platform provides
credentials, run with `file.enabled=false` — or, in the combined worker,
`worker.env.IS_FILE_RUNNER=false`.

## Where Vault runs

Outside the cluster. Nothing here installs or manages it — the deployment only
needs an address and a token that can read the registry, both supplied as
secrets to the deploy workflow.

Mount `tenants` as kv v2 if it does not exist yet:

```bash
vault secrets enable -path=tenants -version=2 kv
```
