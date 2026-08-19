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
  policies=tenants \
  ttl=1h
```

`tenants` is the policy `k8suser` already uses to read the registry — read and
list on `secret/data/tenants/*`. Nothing new has to be created.

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
  policies=tenants
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

## Until Vault is ready

The operator can also authenticate with a token kept in a Secret, which needs no
Vault-side change and still keeps passwords out of Terraform state. It leaves a
long-lived token in the cluster, so it is a stepping stone rather than a
destination.
