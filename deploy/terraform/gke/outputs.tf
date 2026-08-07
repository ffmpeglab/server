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
