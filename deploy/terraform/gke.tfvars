# What this cluster does differently. Resource sizing is not here: the chart
# carries one envelope for every component.
#
# The document directory is shared: render and file hand work over through it and
# render is what scales, so several pods write to it at once. GKE's default class
# cannot do that, so this points at the in-cluster NFS class — see deploy/nfs.

# The operator produces the Secret, so Terraform no longer reads credentials at
# all and none of them reach its state.
manage_secrets = false

chart_values = {
  vaultSecret = {
    enabled = true
    method  = "jwt"
    mount   = "jwt"

    # How long a tenant keeps working after being switched off, since this is
    # what decides when the operator notices the flag.
    refreshAfter = "60s"
  }

  statusGate = { enabled = true }

  documentDir = {
    persistence = {
      enabled      = true
      accessModes  = ["ReadWriteMany"]
      storageClass = "nfs"
      size         = "10Gi"
    }
  }
}
