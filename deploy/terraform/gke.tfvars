# Overrides for a cluster whose default storage class is ReadWriteOnce, which
# is what GKE gives you unless Filestore is provisioned separately.
#
# render and file share a directory, and a ReadWriteOnce volume attaches to one
# pod at a time, so they run as a single process here. Splitting them needs a
# ReadWriteMany volume; until then this is the only combination that schedules.
#
# The file runner stays off because tenant records carry no S3 credentials yet —
# it would come up with nowhere to upload to.

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

  render = { enabled = false }
  file   = { enabled = false }

  # Requests are what the scheduler reserves for the whole life of the pod, so
  # they are sized to what a tenant actually uses while waiting for work: the
  # API and the log reader sit at 1-3m, the render worker at ~25m. Limits are
  # what a pod may burst to, and a render is a burst — hence the wide gap.
  #
  # Sized against a 2 vCPU node: 1930m allocatable, ~860m held by kube-system,
  # leaving room for three tenants at 225m each with headroom to spare. Three
  # tenants rendering at once will contend for CPU; the node fits three idle
  # tenants, not three busy ones.

  worker = {
    enabled = true
    env = {
      IS_RENDER_RUNNER = "true"
      IS_FILE_RUNNER   = "false"
    }
    resources = {
      requests = {
        cpu    = "150m"
        memory = "256Mi"
      }
      limits = {
        cpu    = "1500m"
        memory = "2Gi"
      }
    }
  }

  api = {
    resources = {
      requests = {
        cpu    = "50m"
        memory = "128Mi"
      }
      limits = {
        cpu    = "500m"
        memory = "512Mi"
      }
    }
  }

  logs = {
    resources = {
      requests = {
        cpu    = "25m"
        memory = "96Mi"
      }
      limits = {
        cpu    = "250m"
        memory = "256Mi"
      }
    }
  }

  documentDir = {
    persistence = { enabled = false }
  }
}
