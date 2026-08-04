# Overrides for a single-node demo cluster (minikube on a 2-CPU Docker).
# The chart defaults size a render worker for real footage; a laptop cannot
# schedule that alongside Vault and the metrics stack.

chart_values = {
  worker = {
    resources = {
      requests = {
        cpu    = "200m"
        memory = "512Mi"
      }
      limits = {
        cpu    = "1"
        memory = "1Gi"
      }
    }
  }
  api = {
    resources = {
      requests = {
        cpu    = "50m"
        memory = "192Mi"
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
}
