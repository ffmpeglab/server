# Overrides for a cluster whose default storage class is ReadWriteOnce, which
# is what GKE gives you unless Filestore is provisioned separately.
#
# render and file share a directory, and a ReadWriteOnce volume attaches to one
# pod at a time, so they run as a single process here. Splitting them needs a
# ReadWriteMany volume; until then this is the only combination that schedules.
#
# The file runner stays off because tenant records carry no S3 credentials yet —
# it would come up with nowhere to upload to.

chart_values = {
  render = { enabled = false }
  file   = { enabled = false }

  worker = {
    enabled = true
    env = {
      IS_RENDER_RUNNER = "true"
      IS_FILE_RUNNER   = "false"
    }
    resources = {
      requests = {
        cpu    = "300m"
        memory = "768Mi"
      }
    }
  }

  api = {
    resources = {
      requests = {
        cpu    = "100m"
        memory = "256Mi"
      }
    }
  }

  logs = {
    resources = {
      requests = {
        cpu    = "50m"
        memory = "128Mi"
      }
    }
  }

  documentDir = {
    persistence = { enabled = false }
  }
}
