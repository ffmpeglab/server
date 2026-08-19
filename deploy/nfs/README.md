# nfs

A `ReadWriteMany` storage class for clusters that have none.

## Why

Render and file hand work over through the document directory, and render is the
component that scales — so the same directory has to be writable by several pods
at once. A Persistent Disk attaches to one node at a time and cannot do that.

Google's managed answer is Filestore. It works, but the smallest instance is
1 TiB: about $215 a month for Basic HDD, or $186 for Zonal, in europe-west10.
That is a lot of money to move a file between two pods.

This runs an NFS server in the cluster instead, backed by one ordinary disk. The
capability is the same; the cost is the disk — around $3 a month for 20 GB.

The trade is availability: one server, one replica, so it is a single point of
failure and a node upgrade interrupts it. Fine for a test cluster and for
workloads that retry. Filestore is the answer when that stops being acceptable.

## Install

```bash
helm repo add nfs-ganesha \
  https://kubernetes-sigs.github.io/nfs-ganesha-server-and-external-provisioner/

helm install nfs nfs-ganesha/nfs-server-provisioner \
  --namespace nfs --create-namespace \
  --values deploy/nfs/values.yaml
```

Then point the chart at it:

```hcl
chart_values = {
  documentDir = {
    persistence = {
      enabled      = true
      accessModes  = ["ReadWriteMany"]
      storageClass = "nfs"
    }
  }
}
```

Each tenant gets its own claim on that class — the server is shared, the
directories are not.

## Not this

`gcsfuse` mounts a bucket as a directory and costs almost nothing, but it is
object storage wearing a filesystem's clothes. ffmpeg seeks backwards while
finalising some containers, which that mount handles slowly or not at all.
