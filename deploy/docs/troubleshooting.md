# Troubleshooting

## Where to look first

```bash
kubectl get pods -n ffmpeglab
kubectl describe pod -n ffmpeglab <pod>
kubectl logs -n ffmpeglab <pod> --tail=50
kubectl get events -n ffmpeglab --sort-by=.lastTimestamp | tail -20
```

## Pods stay in Init

The init container waits for `DB_HOST` to resolve. Either the name is wrong or
cluster DNS cannot answer for it:

```bash
kubectl logs -n ffmpeglab <pod> -c wait-for-dns
```

A Supabase project resolves only through its pooler host; `db.<ref>.supabase.co`
has an IPv6 address and no A record, so nothing in a cluster can reach it.



## Pending pods

```bash
kubectl describe pod -n ffmpeglab <pod> | sed -n '/Events:/,$p'
kubectl describe node | grep -A5 "Allocated resources"
```

`Insufficient cpu` means the node is full. Three instances of four components fit
on a two vCPU node with about 500m to spare; a fourth does not.

`ReadWriteMany` on a cluster with no such class leaves the claim `Pending`
forever. Point `DOCUMENT_STORAGE_CLASS` at a class that provides it, or use
`DOCUMENT_EXISTING_CLAIM`.

## Helm says the rollout succeeded but nothing works

A Deployment with one replica and `maxUnavailable: 1` never breaches its
availability budget, so `--wait` returns immediately even with zero ready pods.
Check the Deployments directly:

```bash
kubectl rollout status -n ffmpeglab deployment --timeout=5m
```

## An edit to the chart changes nothing

`helm_release` compares chart versions. Bump `version` in `Chart.yaml`.

## minikube will not start: `certSANs: Invalid value: ""`

```
error: apiServer.certSANs: Invalid value: "": altname is not a valid IP address
```

The stored profile lost the node's address — `~/.minikube/profiles/minikube/config.json`
has an empty `IP` while the container itself has one. minikube then builds a
certificate name list containing an empty string, which kubeadm rejects.

```bash
minikube delete
```

That removes the profile and the container; the next start writes a correct one.
It is a minikube bug, not a deployment problem — the script stops before touching
the cluster.

## minikube shows an empty cluster in a GUI client

`minikube stop` hands out a new API server port on the next start. `kubectl`
follows; Lens and similar keep the old connection until reconnected.
