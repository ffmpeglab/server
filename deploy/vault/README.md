# vault

Vault holds the tenant registry. One entry per Supabase instance; the reconciler
turns that registry into one Helm release of `../helm/ffmpeglab` per tenant.

Tenants register themselves: the Vault UI is reachable from the internet and its
OIDC method points at Supabase, so signing in with a Supabase account is the
whole onboarding step. Nobody hands out credentials by side channel.

```
tenant signs in to Vault UI  ──OIDC──▶  Supabase
                                          │
        tenants/<subject> written  ◀───────┘
                    │
                    ▼
          reconciler  ──▶  helm release per tenant  ──▶  that tenant's Supabase
```

## Install

```bash
helm repo add hashicorp https://helm.releases.hashicorp.com
helm install vault hashicorp/vault -n vault --create-namespace \
  -f deploy/vault/values.yaml
```

The bundled values run Vault in dev mode: in-memory storage, auto-unsealed, root
token `root`. That is right for a demo cluster and wrong for anything that has to
survive a restart — switch to `server.ha` with real storage before it matters.

## Configure

```bash
kubectl -n vault port-forward svc/vault 8200:8200 &

export VAULT_ADDR=http://127.0.0.1:8200
export VAULT_TOKEN=root
export SUPABASE_PROJECT_URL=https://<ref>.supabase.co
export VAULT_PUBLIC_URL=http://localhost:8200
export OIDC_CLIENT_ID=...
export OIDC_CLIENT_SECRET=...

./deploy/vault/setup.sh
```

The script mounts `tenants/` as kv-v2, enables the OIDC method, writes the
`tenant` policy and wires Supabase as the provider. It is idempotent and
non-interactive, and it exits non-zero on the first failure. Run it without the
two OIDC variables and it configures everything else, then prints the redirect
URIs to register.

### Registering the OAuth client

Supabase publishes OIDC discovery per project and supports `authorization_code`
with PKCE, which is what the Vault OIDC method needs. It does not offer dynamic
client registration, so the client has to be created once in the Supabase
dashboard, with these redirect URIs:

```
<VAULT_PUBLIC_URL>/ui/vault/auth/oidc/oidc/callback
<VAULT_PUBLIC_URL>/oidc/callback
http://localhost:8250/oidc/callback
```

The last one is only needed for `vault login -method=oidc` from a terminal.

## Isolation

`policies/tenant.hcl` templates the path on the identity's alias name, so every
tenant gets the same policy and a different reachable path. A signed-in user has
no way to name someone else's path, no access to `sys/`, and none to the auth
method or the policies.

This matters more than usual here, because the UI is meant to be public: the
login is the only thing between the internet and this policy. Verified by
signing in as one tenant, reading its own entry, and being denied on another's.

## Registry layout

```
tenants/<subject>
    DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
    S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET_ID
```

Keys match what the application reads, so the reconciler can hand the whole entry
to a Secret and the chart consumes it with `envFrom` — nothing renames anything
along the way.

## Not covered yet

Pulling the connection string from Supabase automatically after sign-in, the
reconciler itself, and an ingress with TLS in front of the UI. Tracked in
[#2](https://github.com/ffmpeglab/server/issues/2).
