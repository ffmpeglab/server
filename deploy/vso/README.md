# vso

Vault Secrets Operator: an in-cluster controller that reads a tenant record from
Vault and keeps a Kubernetes Secret in step with it.

## Why

Without it, credentials reach the cluster from `deploy/.env` through the chart's
`secret.create` block — fine for a laptop, wrong for anything shared, because the
values pass through whoever runs the deploy.

With it the operator reads Vault directly. Nothing outside the cluster handles
the password, and a rotated credential reaches the pods on its own: the operator
rewrites the Secret and restarts the Deployments that use it.

The chart never reads Vault itself. It consumes a Secret by name through
`existingSecret`; who fills that Secret is decided outside the chart.

## What Vault needs

An auth method bound to your cluster and a policy that can read the tenant path.
Both belong to whoever administers Vault — a deploy-time role normally cannot
enable auth methods.

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

Vault verifies the pod's own service account token against the cluster, so no
password or token is stored on the cluster side.

Naming a policy that does not exist is accepted silently: login succeeds, the
name appears on the token, and every read is denied. If reads come back
`permission denied` while login works, check the policy is really there.

## When Vault cannot reach the cluster

`kubernetes` auth requires Vault to call the cluster's API. Where that is not
possible, JWT auth verifies the same token offline against the cluster's public
signing key:

```bash
kubectl get --raw /openid/v1/jwks > jwks.json

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

Each cluster has its own signing key, and a recreated cluster mints a new one.

The operator authenticates with `kubernetes`, `jwt`, `appRole`, `aws` or `gcp`.
There is no method that accepts a token you already hold.

## Install

```bash
helm repo add hashicorp https://helm.releases.hashicorp.com
helm install vault-secrets-operator hashicorp/vault-secrets-operator \
  --namespace vault-secrets-operator --create-namespace \
  --values deploy/vso/values.yaml \
  --set defaultVaultConnection.address=https://<your vault>
```

Then apply `vault-secret.yaml` for the release, filling in the namespace, the
Vault role and the record path, and install the chart with
`--set existingSecret=<the Secret it creates>` instead of `secret.create=true`.

`_raw` and any object-valued field are excluded from the generated Secret: they
would arrive as JSON strings in the pods' environment, and `_raw` repeats the
password the individual keys already carry.

## Cost

The operator asks for 100m CPU and 128Mi — roughly what one FFmpegLab component
reserves. Worth knowing before adding it to a node that is already tight.
