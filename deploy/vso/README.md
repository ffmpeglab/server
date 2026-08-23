# vso

Vault Secrets Operator reads the tenant record from Vault and writes it into the
cluster as a Secret. The release consumes that Secret by name, so no credential
passes through the machine running the deploy.

## Install

```bash
helm repo add hashicorp https://helm.releases.hashicorp.com
helm install vault-secrets-operator hashicorp/vault-secrets-operator \
  --namespace vault-secrets-operator --create-namespace \
  --values deploy/vso/values.yaml \
  --set defaultVaultConnection.address=https://<your vault>
```

Then set `VAULT_ADDR`, `VAULT_ROLE` and `TENANT_PATH` in `deploy/.env` and run
`./deploy/deploy.sh`. It applies `vault-secret.yaml` for the release, waits for
the Secret to appear, and installs the chart against it.

The operator asks for 100m CPU and 128Mi.

## The tenant record

One record per tenant at `secret/tenants/<userId>/<projectId>`:

```json
{
  "IS_SUPABASE_PLATFORM": true,
  "PIPELINES_API_ENABLED": true,
  "PLATFORM_HOST": "https://platform.ffmpeglab.com",
  "S3_ENDPOINT": "https://{projectId}.storage.supabase.co/storage/v1/s3",
  "S3_REGION": "eu-central-1",
  "SUPABASE_ANON_KEY": "eyJ...",
  "SUPABASE_HOST": "https://{projectId}.supabase.co",
  "SUPABASE_PROJECT_ID": "{projectId}",
  "TENANT_SECRET_KEY": "{password}",
  "TENANT_SERVICE_KEY": "",
  "TENANT_USER_ID": "{userId}",
  "TENANT_WORKER_LOGIN": "worker@ffmpeglab.com"
}
```

Every field becomes a key of the Secret and reaches the pods through `envFrom`.
No name is hardcoded in the chart, so a new field needs no change here.

`_raw` and any object-valued field are excluded: they would arrive as JSON
strings in the environment, and `_raw` repeats what the individual keys carry.

The record is written by the platform. This repository only reads it.

## What Vault needs

An auth method bound to the cluster and a policy that can read the tenant path.
Both belong to whoever administers Vault — a deploy-time role cannot enable auth
methods.

```bash
vault policy write ffmpeglab-tenants - <<'HCL'
path "secret/data/tenants/*" {
  capabilities = ["read", "list"]
}
HCL

vault auth enable kubernetes

vault write auth/kubernetes/config \
  kubernetes_host=https://<cluster API endpoint> \
  kubernetes_ca_cert=@ca.crt

vault write auth/kubernetes/role/ffmpeglab \
  bound_service_account_names=ffmpeglab-vault \
  bound_service_account_namespaces=<namespace> \
  policies=ffmpeglab-tenants \
  ttl=1h
```

Vault verifies the pod's own service account token against the cluster, so
nothing is stored on the cluster side.

Naming a policy that does not exist is accepted silently: login succeeds, the
name appears on the token, and every read is denied. If reads come back
`permission denied` while login works, check the policy is really there.

## When Vault cannot reach the cluster

`kubernetes` auth requires Vault to call the cluster's API. Where that is not
possible, JWT auth verifies the same token offline against the cluster's public
signing key:

```bash
kubectl get --raw /openid/v1/jwks

vault auth enable -path=jwt jwt
vault write auth/jwt/config jwt_validation_pubkeys=@pubkey.pem

vault write auth/jwt/role/ffmpeglab \
  role_type=jwt \
  user_claim=sub \
  bound_audiences=https://kubernetes.default.svc \
  bound_claims_type=glob \
  bound_claims='{"sub":"system:serviceaccount:<namespace>:ffmpeglab-vault"}' \
  policies=ffmpeglab-tenants
```

`bound_claims` is a map, so it has to arrive as JSON in single quotes —
`bound_claims=sub=…` is rejected with `expected a map, got 'string'`.

Set `VAULT_METHOD=jwt` and `VAULT_MOUNT=jwt` in `deploy/.env` for this. Each
cluster has its own signing key, and a recreated cluster mints a new one.
