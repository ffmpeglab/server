#!/usr/bin/env bash
# Configures Vault as the tenant registry, with Supabase as the OIDC provider.
#
# Idempotent: safe to re-run. Every step either applies or is already applied.
# Non-interactive: everything comes from the environment, nothing is prompted,
# so this can run from CI or from an operator's shell unchanged.
#
#   VAULT_ADDR                 required, e.g. http://127.0.0.1:8200
#   VAULT_TOKEN                required
#   SUPABASE_PROJECT_URL       required, e.g. https://<ref>.supabase.co
#   VAULT_PUBLIC_URL           required, the address browsers reach Vault on
#   OIDC_CLIENT_ID             optional; OIDC config is skipped without it
#   OIDC_CLIENT_SECRET         optional
#
# Exits non-zero on the first failure. Errors are not swallowed.

set -euo pipefail

: "${VAULT_ADDR:?VAULT_ADDR is required}"
: "${VAULT_TOKEN:?VAULT_TOKEN is required}"
: "${SUPABASE_PROJECT_URL:?SUPABASE_PROJECT_URL is required}"
: "${VAULT_PUBLIC_URL:?VAULT_PUBLIC_URL is required}"

export VAULT_ADDR VAULT_TOKEN

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOUNT="${TENANT_MOUNT:-tenants}"
ROLE="${OIDC_ROLE:-tenant}"
ISSUER="${SUPABASE_PROJECT_URL%/}/auth/v1"

log() { printf '  %s\n' "$*"; }

# --- tenant registry -------------------------------------------------------
if vault secrets list -format=json | grep -q "\"${MOUNT}/\""; then
  log "kv already mounted at ${MOUNT}/"
else
  vault secrets enable -path="${MOUNT}" -version=2 kv >/dev/null
  log "mounted kv-v2 at ${MOUNT}/"
fi

# --- oidc auth method ------------------------------------------------------
if vault auth list -format=json | grep -q '"oidc/"'; then
  log "oidc auth method already enabled"
else
  vault auth enable oidc >/dev/null
  log "enabled oidc auth method"
fi

# The policy templates on the alias name, which requires the accessor of this
# specific mount — it differs per Vault instance, so it is substituted here
# rather than hardcoded in the .hcl file.
ACCESSOR="$(vault auth list -format=json | sed -n 's/.*"oidc\/": *{[^}]*"accessor": *"\([^"]*\)".*/\1/p')"
if [ -z "$ACCESSOR" ]; then
  ACCESSOR="$(vault read -format=json sys/auth/oidc | sed -n 's/.*"accessor": *"\([^"]*\)".*/\1/p')"
fi
[ -n "$ACCESSOR" ] || { echo "could not determine the oidc auth accessor" >&2; exit 1; }
log "oidc accessor: ${ACCESSOR}"

sed -e "s|AUTH_ACCESSOR|${ACCESSOR}|g" -e "s|tenants/|${MOUNT}/|g" \
  "${SCRIPT_DIR}/policies/tenant.hcl" | vault policy write tenant - >/dev/null
log "wrote policy 'tenant'"

# --- supabase as the identity provider -------------------------------------
if [ -z "${OIDC_CLIENT_ID:-}" ] || [ -z "${OIDC_CLIENT_SECRET:-}" ]; then
  cat <<EOF

  OIDC_CLIENT_ID / OIDC_CLIENT_SECRET are unset, so the provider was not wired.
  Register an OAuth client in the Supabase dashboard with these redirect URIs:

    ${VAULT_PUBLIC_URL%/}/ui/vault/auth/oidc/oidc/callback
    ${VAULT_PUBLIC_URL%/}/oidc/callback
    http://localhost:8250/oidc/callback

  then re-run this script with both variables set.
EOF
  exit 0
fi

vault write auth/oidc/config \
  oidc_discovery_url="${ISSUER}" \
  oidc_client_id="${OIDC_CLIENT_ID}" \
  oidc_client_secret="${OIDC_CLIENT_SECRET}" \
  default_role="${ROLE}" >/dev/null
log "configured oidc against ${ISSUER}"

vault write "auth/oidc/role/${ROLE}" \
  user_claim="sub" \
  allowed_redirect_uris="${VAULT_PUBLIC_URL%/}/ui/vault/auth/oidc/oidc/callback,${VAULT_PUBLIC_URL%/}/oidc/callback,http://localhost:8250/oidc/callback" \
  token_policies="tenant" \
  oidc_scopes="openid,email,profile" \
  token_ttl="1h" >/dev/null
log "wrote oidc role '${ROLE}'"

echo
echo "Vault is ready. Tenants sign in at ${VAULT_PUBLIC_URL%/}/ui and land on ${MOUNT}/<their subject>."
