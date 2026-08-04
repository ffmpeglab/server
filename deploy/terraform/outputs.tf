output "tenants" {
  description = "Tenants found in the registry and where each one runs."
  value = {
    for name, t in local.tenants : name => {
      namespace = t.namespace
      release   = t.slug
    }
  }
}

output "tenant_count" {
  value = length(local.tenants)
}
