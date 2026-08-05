# vault

Vault holds the tenant registry that `../terraform` reads: one entry per
Supabase instance, keyed by tenant.

```
tenants/<name>
    DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
    S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET_ID
```

Keys match what the application reads, so the reconciler hands the whole entry
to a Secret and the chart consumes it with `envFrom` — nothing renames anything
along the way.

How entries get written is out of scope here.

## Running Vault in the cluster

Only needed if there is no Vault already. Skip this if one exists.

```bash
helm repo add hashicorp https://helm.releases.hashicorp.com
helm install vault hashicorp/vault -n vault --create-namespace \
  -f deploy/vault/values.yaml

vault secrets enable -path=tenants -version=2 kv
```

These values run Vault in dev mode: in-memory storage, auto-unsealed, root
token. Right for a demo cluster, wrong for anything that has to survive a
restart — switch to `server.ha` with real storage before it matters.

Vault is reached from inside the cluster; nothing here exposes it.
