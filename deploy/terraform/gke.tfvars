# Overrides for a cluster whose default storage class is ReadWriteOnce, which
# is what GKE gives you unless Filestore is provisioned separately.
#
# Resource sizing lives in the chart — one envelope for every component. What is
# left here is what this cluster does differently.
#
# The document directory is not a shared volume: GKE's default storage class is
# ReadWriteOnce, which attaches to one pod at a time, so render and file each get
# their own scratch space. Anything they need to hand over has to go through
# storage rather than the filesystem.

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
    persistence = { enabled = false }
  }
}
