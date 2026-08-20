# Shared state, so a run that starts somewhere else does not try to recreate
# tenants that already exist. The bucket is passed at init time:
#
#   terraform init -backend-config="bucket=<project>-tfstate"
#
# Delete this file to keep state in a local file instead — which is what you
# want for a laptop cluster, and what lets this run without a Google account.

terraform {
  backend "gcs" {
    prefix = "reconciler"
  }
}
