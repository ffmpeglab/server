# gke

Creates the cluster the tenants run on: one zonal control plane and one
autoscaling pool of spot nodes. Separate from `../` on purpose — the cluster is
created once, the tenant releases change constantly.

## Create it

```bash
gcloud auth application-default login
gcloud config set project <project>

terraform -chdir=deploy/terraform/gke init
terraform -chdir=deploy/terraform/gke apply -var project_id=<project>
```

Then point kubectl at it — the exact command is in the `get_credentials` output.

## Choices worth knowing

**Zonal, not regional.** One control plane instead of three. The free control
plane allowance covers one zonal cluster per account; check current pricing
before assuming it still applies, and note that nodes are billed separately
either way.

**Spot nodes by default.** A fraction of the on-demand price, reclaimable at any
time and restarted at least once a day regardless. Runners tolerate that: an
interrupted render returns to the queue. Set `spot = false` if you would rather
not lose renders in flight.

**One node, no autoscaling.** `min_nodes` and `max_nodes` are both 1 — there is
nothing to gain from spare capacity while this is being tried out, and an idle
node is billed like a busy one. Raise `max_nodes` when more than one tenant
renders at a time.

**20 GB disk.** The image alone is 1.1 GB and the node OS takes a few more, so
this leaves somewhere around 15 GB for renders. A render holds both the source
and the output at once, so long footage will want more.

**`n2d-standard-2` by default.** Rendering is CPU bound, so this is the knob that
decides how many concurrent renders a node handles. Shared-core machines will
start the pods and then crawl through any real file.

## Storage, and why the chart is configured differently here

The chart can run render and file as separate deployments sharing the document
directory, which needs a `ReadWriteMany` volume. GKE's default storage class is
`ReadWriteOnce` — two pods cannot mount it at once. `ReadWriteMany` there means
Filestore, which is not cheap, or an NFS provisioner to run and maintain.

So on GKE use the combined runner instead: one process does both steps and the
directory is an `emptyDir` private to that pod.

```bash
--set worker.enabled=true --set render.enabled=false --set file.enabled=false \
--set documentDir.persistence.enabled=false
```

Split runners are the better shape when shared storage exists — see
[../../helm/ffmpeglab/values.yaml](../../helm/ffmpeglab/values.yaml).

## After the cluster exists

The deploy workflow needs, under Settings → Environments → `production`:

- `KUBE_CONFIG` — base64 of a kubeconfig for this cluster
- `KUBE_CONTEXT` — the `kube_context` output of this module
- `VAULT_ADDR` and `VAULT_TOKEN` — the external Vault holding the tenant registry

Nothing here creates Vault. It lives outside the cluster and the deployment only
reads the registry from it.
