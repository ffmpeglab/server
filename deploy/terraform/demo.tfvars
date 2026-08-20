# Overrides for a single-node demo cluster (minikube on a 2-CPU Docker).
#
# A laptop cannot give every runner its own volume, so the runners share one
# ReadWriteOnce claim, which a single-node cluster is willing to attach to
# several pods because they all land on that node.
#
# The secrets operator is not used here. It authenticates as a pod of the GKE
# cluster and Vault verifies that against Google's published signing keys, which
# a local cluster has no way to produce — so Terraform writes the Secrets, which
# is what manage_secrets defaults to.
#
# The file runner stays off for the same reason it is off in GKE: it calls
# config.s3.endpoint.search(...) in its constructor and tenant records carry no
# storage keys, so it exits during startup.

chart_values = {
  file = { enabled = false }

  documentDir = {
    persistence = {
      accessModes = ["ReadWriteOnce"]
    }
  }
}
