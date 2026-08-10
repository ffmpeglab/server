# Lets the deploy workflow reach the cluster without a stored kubeconfig.
#
# A kubeconfig is a snapshot: recreate the cluster and its endpoint and CA
# change, so any copy sitting in a repository secret goes stale. Here the runner
# exchanges its GitHub OIDC token for a short-lived Google one and asks for
# cluster credentials at run time, so they are current by construction and there
# is no long-lived key to rotate or leak.

resource "google_project_service" "iamcredentials" {
  project            = var.project_id
  service            = "iamcredentials.googleapis.com"
  disable_on_destroy = false
}

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "${var.cluster_name}-github"
  display_name              = "GitHub Actions"

  depends_on = [google_project_service.iamcredentials]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
  }

  # Without this any GitHub repository in the world could assume the account.
  attribute_condition = "assertion.repository == '${var.github_repository}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "deployer" {
  project      = var.project_id
  account_id   = "${var.cluster_name}-deployer"
  display_name = "${var.cluster_name} deploy workflow"
}

# Only that one repository may impersonate the account.
resource "google_service_account_iam_member" "deployer_wif" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

# Enough to fetch credentials and manage objects inside the cluster, not enough
# to change the cluster itself.
resource "google_project_iam_member" "deployer" {
  for_each = toset([
    "roles/container.developer",
    "roles/container.clusterViewer",
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.deployer.email}"
}
