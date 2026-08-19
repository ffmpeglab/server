# Overrides for a single-node demo cluster (minikube on a 2-CPU Docker).
#
# A laptop cannot give every runner its own volume, so the runners share one
# ReadWriteOnce claim, which a single-node cluster is willing to attach to
# several pods because they all land on that node.

chart_values = {
  documentDir = {
    persistence = {
      accessModes = ["ReadWriteOnce"]
    }
  }
}
