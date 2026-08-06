# terraform

Turns the Vault tenant registry into running tenants. The registry is the input,
the cluster is the output: an entry under `tenants/` becomes a namespace, a
Secret and a Helm release; removing the entry tears all three down.

Adding a Supabase instance is writing one Vault entry. Nothing else.

## Run

```bash
kubectl -n vault port-forward svc/vault 8200:8200 &

export VAULT_ADDR=http://127.0.0.1:8200
export VAULT_TOKEN=<token>
export TF_VAR_vault_token=$VAULT_TOKEN

terraform init
terraform plan
terraform apply
```

On a single-node cluster add `-var-file=demo.tfvars`: the chart sizes a render
worker for real footage, which will not schedule next to Vault and the metrics
stack on a laptop.

## What it reads

Every key under `tenants/<name>` is passed through to the Secret untouched, and
the chart consumes it with `envFrom`. Terraform never needs to know which keys
exist, so a new variable in the application means editing the Vault entry and
nothing here.

## From CI

`.github/workflows/deploy.yml` runs the same apply on a published release that
is not a prerelease, and on manual dispatch. The job is bound to the
`production` environment, so approval rules and the secrets below are repository
settings rather than anything encoded in the workflow.

Repository settings → Environments → `production`:

| Secret | What it is |
|--------|------------|
| `KUBE_CONFIG` | base64 of a kubeconfig for the target cluster, scoped to a service account that can manage the tenant namespaces |
| `VAULT_ADDR` | Vault address reachable from the runner |
| `VAULT_TOKEN` | token allowed to list `tenants/metadata` and read `tenants/data/*`, nothing more |

One variable, not a secret: `KUBE_CONTEXT`, the context name inside that
kubeconfig.

`base64 -w0 ~/.kube/config` produces the value for `KUBE_CONFIG`; on macOS it is
`base64 -i ~/.kube/config`.

The `VAULT_TOKEN` should not be root. It ends up in the Terraform state, so
scope it to the registry and rotate it like any other deploy credential.

## Notes

`manage_secrets = true` copies credentials from Vault into Kubernetes Secrets,
which also puts them in the Terraform state. Encrypt the state, or set it to
`false` and let External Secrets Operator own the Secrets instead.

The registry is listed over the raw API rather than with
`vault_kv_secrets_list_v2`, because that data source errors instead of returning
nothing when the registry is empty — which would make removing the last tenant
impossible.

Releases are created with `atomic = true`: a tenant that cannot reach its
Supabase fails the apply instead of leaving a crash-looping release behind.

## Verified

Writing an entry brought up a working tenant on a real Supabase project — API
answering, queues consumed. Deleting the entry destroyed the namespace, the
Secret and the release, leaving `tenant_count = 0`. Writing it back recreated
all three.
