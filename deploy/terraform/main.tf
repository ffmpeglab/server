# Vault registry in, running tenants out: an entry becomes a namespace, a
# Secret and a release; removing it tears all three down.

# Not vault_kv_secrets_list_v2: it errors on an empty registry, which would
# make removing the last tenant impossible. Use a list-only token here — the
# http data source keeps request headers in state.
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
  # Vault subjects may contain characters Kubernetes rejects in object names.
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

# Passed through as-is, so a new variable in the app means editing Vault only.
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
  chart     = var.chart_path != "" ? var.chart_path : "${path.module}/../helm/ffmpeglab"
  namespace = kubernetes_namespace.tenant[each.key].metadata[0].name

  # Fail the apply rather than leave a crash-looping release behind.
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
