# Shared home for the reconciler's state.
#
# Without it every CI run starts empty, tries to create tenants that already
# exist and fails on the second run. Versioning is on because the state is the
# only record of what belongs to whom — losing it means orphaned namespaces that
# Terraform no longer knows about.

resource "google_storage_bucket" "state" {
  project  = var.project_id
  name     = "${var.project_id}-tfstate"
  location = var.region

  uniform_bucket_level_access = true
  force_destroy               = false

  versioning {
    enabled = true
  }
}

resource "google_storage_bucket_iam_member" "deployer_state" {
  bucket = google_storage_bucket.state.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.deployer.email}"
}
