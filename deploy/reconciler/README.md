# reconciler

The reconciler as a CronJob, so a cluster follows the registry on its own.

## Why

The workflow in `.github/workflows/deploy.yml` does this from the outside: it
runs on a release, on a repository dispatch, or by hand. That covers deploying a
new version, but it makes tenant onboarding depend on something posting to
GitHub — and on a laptop cluster there is nothing to post at all.

Running the same Terraform inside the cluster removes that dependency. The
cluster reads Vault directly and needs nothing else: no GitHub, no bucket, no
credentials on anyone's machine.

The split that leaves:

| What changed | What reacts |
|---|---|
| a tenant switched on or off | this CronJob, within two minutes |
| a tenant's password rotated | the secrets operator, within a minute |
| a new version of the application released | the GitHub workflow |

## What it needs

Vault credentials, as a Secret. Userpass, the same account CI uses — the
operator cannot authenticate this way, but an ordinary process can:

```bash
kubectl create secret generic vault-login -n ffmpeglab-reconciler \
  --from-literal=VAULT_ADDR=https://vault.ffmpeglab.com \
  --from-literal=VAULT_USERNAME=<user> \
  --from-literal=VAULT_PASSWORD=<password>
```

Permission to install charts. `cluster-admin`, because Helm creates whatever a
chart contains and a narrower role breaks the moment the chart grows a kind.

State stays in a Secret in its own namespace, through Terraform's `kubernetes`
backend — depending on a bucket would defeat the point of running here.

## Install

```bash
# minikube: build straight into the cluster's own daemon, no registry involved
eval $(minikube docker-env)
docker build -f deploy/reconciler/Dockerfile -t ffmpeglab-reconciler:local deploy/

kubectl apply -f deploy/reconciler/manifests.yaml
kubectl create secret generic vault-login -n ffmpeglab-reconciler ...
```

For a real cluster, push the image somewhere it can pull from and set `image` in
the manifest to match.

## Handing over an existing cluster

This job keeps its own state, so tenants that another Terraform already created
are invisible to it — it will try to create them again and fail on names that
exist. Release them first:

```bash
terraform destroy -var-file=<profile>.tfvars
```

Then let the job build them back. It takes one run.

## Watching it

```bash
kubectl get pods -n ffmpeglab-reconciler
kubectl logs -n ffmpeglab-reconciler -l job-name=<job> --tail=20
```

A run with nothing to do reports no changes and finishes in about five seconds.
A longer one is doing work: Helm waits for the pods of a release it installed or
changed, and `timeout` in `helm_release` gives that five minutes before it gives
up and rolls back.

Where the knobs are:

| What | Where |
|---|---|
| how often it checks | `schedule` in `manifests.yaml` |
| how long it waits for pods | `timeout` in `helm_release`, `deploy/terraform/main.tf` |
| whether a failed release rolls back | `atomic`, same resource |
| which profile it applies | `TF_VAR_FILE` in `manifests.yaml` |
