# A cluster for the tenant workloads. Deliberately small: one zonal control
# plane and one autoscaling pool of spot nodes.

resource "google_project_service" "container" {
  project            = var.project_id
  service            = "container.googleapis.com"
  disable_on_destroy = false
}

resource "google_service_account" "nodes" {
  project      = var.project_id
  account_id   = "${var.cluster_name}-nodes"
  display_name = "${var.cluster_name} GKE nodes"
}

# Nodes need to pull images and ship logs, nothing else. The tenant credentials
# reach the pods from Vault, so nodes never hold anything of their own.
resource "google_project_iam_member" "nodes" {
  for_each = toset([
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/artifactregistry.reader",
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.nodes.email}"
}

resource "google_container_cluster" "this" {
  name     = var.cluster_name
  project  = var.project_id
  location = var.zone

  # The default pool cannot be configured after creation, so it is replaced by
  # the managed one below.
  remove_default_node_pool = true
  initial_node_count       = 1

  deletion_protection = var.deletion_protection

  release_channel {
    channel = var.release_channel
  }

  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  # Managed Prometheus and its kube-state-metrics reserve ~110m of a 2 vCPU
  # node to scrape workloads nothing reads. System component monitoring stays,
  # so the cluster itself is still observable.
  monitoring_config {
    enable_components = ["SYSTEM_COMPONENTS"]

    managed_prometheus {
      enabled = false
    }
  }

  # The L7 backend exists to serve Ingress, and tenants are reached through
  # port-forward or a Service.
  addons_config {
    http_load_balancing {
      disabled = true
    }
  }

  depends_on = [google_project_service.container]
}

resource "google_container_node_pool" "this" {
  name     = "${var.cluster_name}-pool"
  project  = var.project_id
  location = var.zone
  cluster  = google_container_cluster.this.name

  autoscaling {
    min_node_count = var.min_nodes
    max_node_count = var.max_nodes
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }

  node_config {
    machine_type = var.machine_type
    disk_size_gb = var.disk_size_gb
    spot         = var.spot

    service_account = google_service_account.nodes.email
    oauth_scopes    = ["https://www.googleapis.com/auth/cloud-platform"]

    workload_metadata_config {
      mode = "GKE_METADATA"
    }
  }

  lifecycle {
    ignore_changes = [node_config[0].labels]
  }
}
