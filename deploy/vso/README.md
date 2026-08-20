# vso

Vault Secrets Operator: an in-cluster controller that reads the tenant record
from Vault and keeps a Kubernetes Secret in step with it.

## Why

Today Terraform reads the record and writes the Secret, which puts every tenant
password into Terraform state — one more place credentials live, on top of Vault
and the cluster. The operator reads Vault directly, so state holds only which
tenants exist.

It also removes a round trip: a rotated password reaches the pods on its own,
with no pipeline run, and the operator restarts the deployments itself.

Terraform still owns the namespace and the release. The split is: Terraform
decides who exists, the operator decides what credentials they hold.

## What Vault needs first

Kubernetes auth is not enabled on `vault.ffmpeglab.com`, and the `k8suser` role
cannot enable it — it holds the `default` policy and cannot read `sys/auth`. This
part has to happen on the Vault side.

```bash
vault auth enable kubernetes

vault write auth/kubernetes/config \
  kubernetes_host=https://<cluster endpoint> \
  kubernetes_ca_cert=@ca.crt

# One role per cluster. The bound names are what stops a pod in some other
# namespace from reading another tenant's credentials.
vault write auth/kubernetes/role/ffmpeglab \
  bound_service_account_names=ffmpeglab-vault \
  bound_service_account_namespaces='ffmpeglab-*' \
  policies=ffmpeglab-tenants \
  ttl=1h
```

With a policy that only reads the registry:

```hcl
path "secret/data/tenants/*" {
  capabilities = ["read", "list"]
}
```

The cluster endpoint and CA certificate come from:

```bash
gcloud container clusters describe <cluster> --zone <zone> \
  --format="value(endpoint,masterAuth.clusterCaCertificate)"
```

The certificate arrives base64 encoded; decode it into `ca.crt`.

Nothing here needs a password. Vault checks the pod's own service account token
against the cluster, so no credential is stored on our side at all.

## On a private cluster

The above has Vault reaching into the cluster API, which a private cluster does
not allow. Use JWT auth instead: GKE publishes a discovery endpoint that is
public even when the cluster is not, so Vault verifies the same service account
token offline and never connects to the cluster.

```bash
vault auth enable jwt
vault write auth/jwt/config \
  oidc_discovery_url=https://container.googleapis.com/v1/projects/<project>/locations/<zone>/clusters/<cluster>

# A glob on the subject covers every tenant namespace, so a new tenant does
# not need a new role.
vault write auth/jwt/role/ffmpeglab \
  role_type=jwt \
  user_claim=sub \
  bound_audiences=https://kubernetes.default.svc \
  bound_claims_type=glob \
  bound_claims='{"sub":"system:serviceaccount:ffmpeglab-*:ffmpeglab-vault"}' \
  policies=ffmpeglab-tenants
```

`bound_claims` is a map, so it has to arrive as JSON in single quotes —
`bound_claims=sub=...` is rejected with `expected a map, got 'string'`.

Set `vaultSecret.method` and `vaultSecret.mount` to `jwt` for this. The signing
keys behind that discovery URL are served without authentication, which is what
lets Vault verify a token it cannot ask the cluster about. CI reaches a private cluster through
Connect Gateway, which runs over the workload identity federation already in
place — no address allowlist, and no public endpoint.

## Install

```bash
helm repo add hashicorp https://helm.releases.hashicorp.com
helm install vault-secrets-operator hashicorp/vault-secrets-operator \
  --namespace vault-secrets-operator --create-namespace \
  --values deploy/vso/values.yaml \
  --set defaultVaultConnection.address=https://vault.ffmpeglab.com
```

Then turn the chart flag on so each tenant declares its own secret:

```hcl
chart_values = {
  vaultSecret = {
    enabled = true
    role    = "ffmpeglab"
    path    = "tenants/<userId>"
  }
}
```

and let Terraform stop writing Secrets:

```bash
terraform apply -var manage_secrets=false -var-file=gke.tfvars
```

## Cost

The operator asks for 100m CPU and 128Mi. On a two vCPU node with three tenants
that leaves room, but it is roughly what a whole tenant reserves — worth knowing
before adding it to a node that is already tight.

## On a cluster Vault cannot reach

The operator authenticates with one of `kubernetes`, `jwt`, `appRole`, `aws` or
`gcp` — there is no method that takes a token you already hold. That rules out
`kubernetes` for a laptop cluster, since Vault has to call the cluster's API to
verify a token and a minikube behind a home router is not reachable.

Two things do work.

`jwt` again, but with the key pasted in rather than fetched. Vault verifies the
signature offline, so it needs no route to the cluster:

```bash
kubectl get --raw /openid/v1/jwks     # the cluster's public signing key

vault auth enable -path=jwt-local jwt
vault write auth/jwt-local/config jwt_validation_pubkeys=@pubkey.pem
vault write auth/jwt-local/role/ffmpeglab \
  role_type=jwt user_claim=sub \
  bound_audiences="https://kubernetes.default.svc.cluster.local" \
  bound_claims_type=glob \
  bound_claims='{"sub":"system:serviceaccount:ffmpeglab-*:ffmpeglab-vault"}' \
  policies=ffmpeglab-tenants
```

Every cluster has its own key and minikube mints a new one when it is recreated,
so this is a Vault change per developer machine.

`appRole` avoids that: one role serves any cluster, and the credential lives in
a Secret next to the operator. That is a long-lived credential in the cluster —
the thing this whole arrangement exists to avoid — which is why it belongs on a
laptop and not in GKE.

Without either, a local cluster still follows the registry: Terraform reads it
and writes the Secrets, which is what `manage_secrets` does by default. What is
lost is the operator noticing a change on its own.
