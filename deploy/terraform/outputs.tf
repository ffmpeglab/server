output "tenants" {
  description = "Tenants found in the registry and where each one runs."
  value = {
    for path, t in local.tenants : path => {
      namespace = t.namespace
      release   = t.slug
    }
  }
}

output "tenant_count" {
  value = length(local.tenants)
}
