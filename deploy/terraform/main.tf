# Turns the Vault tenant registry into running tenants.
#
# The registry is the input and the cluster is the output: whatever is under
# tenants/ gets a namespace, a Secret and a Helm release; whatever is removed
# from it gets torn down on the next apply. Adding a Supabase instance is
# writing one Vault entry, nothing else.

# Listed over the raw API rather than with vault_kv_secrets_list_v2, which
# errors instead of returning nothing when the registry is empty — that would
# make removing the last tenant impossible. A 404 here is a legitimate state:
# no tenants registered yet, or all of them removed.
data "http" "tenant_list" {
  url = "${trimsuffix(var.vault_address, "/")}/v1/${var.tenant_mount}/metadata?list=true"

  request_headers = {
    X-Vault-Token = var.vault_token
  }
}

locals {
  tenant_names = contains([200], data.http.tenant_list.status_code) ? jsondecode(data.http.tenant_list.response_body).data.keys : []
}

data "vault_kv_secret_v2" "tenant" {
  for_each = toset(local.tenant_names)

  mount = var.tenant_mount
  name  = each.value
}

locals {
  # Vault subjects are opaque and may contain characters Kubernetes rejects in
  # object names, so the label is normalised while the Vault path keeps the
  # original.
  tenants = {
    for name in local.tenant_names :
    name => {
      slug      = substr(replace(lower(name), "/[^a-z0-9-]/", "-"), 0, 40)
      namespace = "${var.namespace_prefix}${substr(replace(lower(name), "/[^a-z0-9-]/", "-"), 0, 40)}"
      data      = data.vault_kv_secret_v2.tenant[name].data
    }
  }
}

resource "kubernetes_namespace" "tenant" {
  for_each = local.tenants

  metadata {
    name = each.value.namespace
    labels = {
      "app.kubernetes.io/part-of" = "ffmpeglab"
      "ffmpeglab.com/tenant"      = each.value.slug
    }
  }
}

# Everything the tenant entry holds is handed over as-is. Terraform never needs
# to know which keys exist, so a new variable in the application is a change to
# the Vault entry alone.
resource "kubernetes_secret" "tenant" {
  for_each = var.manage_secrets ? local.tenants : {}

  metadata {
    name      = "${each.value.slug}-supabase"
    namespace = kubernetes_namespace.tenant[each.key].metadata[0].name
  }

  data = each.value.data
  type = "Opaque"
}

resource "helm_release" "tenant" {
  for_each = local.tenants

  name      = each.value.slug
  chart     = var.chart_path
  namespace = kubernetes_namespace.tenant[each.key].metadata[0].name

  # A tenant that cannot reach its Supabase is a broken tenant, not a slow one:
  # fail the apply instead of leaving a crash-looping release behind.
  atomic          = true
  cleanup_on_fail = true
  timeout         = 300

  values = [
    yamlencode(merge(
      {
        tenant         = { name = each.value.slug }
        existingSecret = var.manage_secrets ? kubernetes_secret.tenant[each.key].metadata[0].name : "${each.value.slug}-supabase"
      },
      var.chart_values,
    )),
  ]

  depends_on = [kubernetes_secret.tenant]
}
