# Vault registry in, running tenants out: an entry becomes a namespace, a
# Secret and a release; switching it off or removing it tears all three down.
#
# The platform writes tenants at secret/tenants/<userId>/<projectId>, so the
# listing walks two levels. Not vault_kv_secrets_list_v2: it errors on an empty
# level instead of returning nothing, which would make removing the last tenant
# impossible.

data "http" "users" {
  url = "${local.metadata_url}?list=true"

  request_headers = {
    X-Vault-Token = var.vault_token
  }
}

locals {
  metadata_url = "${trimsuffix(var.vault_address, "/")}/v1/${var.tenant_mount}/metadata/${trim(var.tenant_prefix, "/")}"

  user_ids = data.http.users.status_code == 200 ? jsondecode(data.http.users.response_body).data.keys : []
}

data "http" "projects" {
  for_each = toset(local.user_ids)

  url = "${local.metadata_url}/${trimsuffix(each.value, "/")}?list=true"

  request_headers = {
    X-Vault-Token = var.vault_token
  }
}

locals {
  # "<userId>/<projectId>" for every project of every user.
  tenant_paths = flatten([
    for user, resp in data.http.projects : [
      for project in(resp.status_code == 200 ? jsondecode(resp.response_body).data.keys : []) :
      "${trimsuffix(user, "/")}/${trimsuffix(project, "/")}"
    ]
  ])
}

# Read over the same API as the listing. The Vault provider marks whatever it
# returns as sensitive, and Terraform then refuses to use any of it — even the
# on/off flag — as a for_each key, since resource keys are visible in plans.
data "http" "tenant" {
  for_each = toset(local.tenant_paths)

  url = "${trimsuffix(var.vault_address, "/")}/v1/${var.tenant_mount}/data/${trim(var.tenant_prefix, "/")}/${each.value}"

  request_headers = {
    X-Vault-Token = var.vault_token
  }
}

locals {
  # kv v2 wraps the secret in data.data, and the platform stores the record one
  # level below that again.
  records = {
    for path, resp in data.http.tenant :
    path => try(jsondecode(resp.response_body).data.data.data, jsondecode(resp.response_body).data.data)
  }

  tenants = {
    for path, record in local.records :
    path => {
      slug      = substr(lower(regexall("[^/]+$", path)[0]), 0, 40)
      namespace = "${var.namespace_prefix}${substr(lower(regexall("[^/]+$", path)[0]), 0, 40)}"
    }
    if try(tostring(record["ffmpeglabStatus"]), "on") == "on"
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

  data = { for k, v in local.records[each.key] : k => tostring(v) if can(tostring(v)) }
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
      var.image_tag != "" ? { image = { tag = var.image_tag } } : {},
    )),
  ]

  depends_on = [kubernetes_secret.tenant]
}
