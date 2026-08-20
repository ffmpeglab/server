#!/bin/sh
# Log in to Vault, then make the cluster match the registry.
set -e

token=$(curl -sf --max-time 30 \
  --data "{\"password\":\"$VAULT_PASSWORD\"}" \
  "$VAULT_ADDR/v1/auth/userpass/login/$VAULT_USERNAME" \
  | sed 's/.*"client_token":"//; s/".*//')

[ -n "$token" ] || { echo "Vault login failed"; exit 1; }

export TF_VAR_vault_token="$token"
export TF_VAR_vault_address="$VAULT_ADDR"
export TF_VAR_chart_path=/work/helm/ffmpeglab

# Empty, so the providers fall back to the service account mounted in this pod
# instead of looking for a kubeconfig that only exists on a laptop.
export TF_VAR_kubeconfig_path=""
export TF_VAR_kube_context=""

cd /work/terraform
terraform init -input=false >/dev/null
terraform apply -input=false -auto-approve ${TF_VAR_FILE:+-var-file=$TF_VAR_FILE}
