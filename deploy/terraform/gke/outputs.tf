output "cluster_name" {
  value = google_container_cluster.this.name
}

output "location" {
  value = google_container_cluster.this.location
}

output "endpoint" {
  value     = google_container_cluster.this.endpoint
  sensitive = true
}

output "get_credentials" {
  description = "Run this to point kubectl at the cluster."
  value       = "gcloud container clusters get-credentials ${google_container_cluster.this.name} --zone ${google_container_cluster.this.location} --project ${var.project_id}"
}

output "kube_context" {
  description = "Context name kubectl creates, for TF_VAR_kube_context in the deploy workflow."
  value       = "gke_${var.project_id}_${google_container_cluster.this.location}_${google_container_cluster.this.name}"
}

# The three values the deploy workflow needs. None is a secret: the provider
# only mints tokens for the repository named above, so knowing its path buys
# nothing on its own.
output "workload_identity_provider" {
  value = google_iam_workload_identity_pool_provider.github.name
}

output "deploy_service_account" {
  value = google_service_account.deployer.email
}

output "github_variables" {
  description = "Repository variables to set, ready to paste."
  value = {
    GCP_PROJECT_ID  = var.project_id
    GKE_CLUSTER     = google_container_cluster.this.name
    GKE_LOCATION    = google_container_cluster.this.location
    WIF_PROVIDER    = google_iam_workload_identity_pool_provider.github.name
    DEPLOY_SA_EMAIL = google_service_account.deployer.email
  }
}

output "state_bucket" {
  description = "Backend bucket for the reconciler — terraform init -backend-config=\"bucket=...\""
  value       = google_storage_bucket.state.name
}
