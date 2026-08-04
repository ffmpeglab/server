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
