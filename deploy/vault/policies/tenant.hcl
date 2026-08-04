# Policy attached to everyone who signs in through the Supabase OIDC method.
#
# The path is templated on the identity's subject claim, so the policy is the
# same for every tenant while the reachable path is not: signing in as one
# Supabase user gives no way to name another user's path. This matters because
# the Vault UI is meant to be publicly reachable — the login is the only thing
# standing between the internet and this policy.

path "tenants/data/{{identity.entity.aliases.AUTH_ACCESSOR.name}}" {
  capabilities = ["create", "read", "update"]
}

path "tenants/metadata/{{identity.entity.aliases.AUTH_ACCESSOR.name}}" {
  capabilities = ["read", "list", "delete"]
}

# Lets the UI render the secret browser for the tenant's own subtree.
path "tenants/metadata" {
  capabilities = ["list"]
}

# Anything a signed-in user should never touch is simply absent: no access to
# other tenants, to sys/, to auth method configuration, or to the policies
# themselves.
