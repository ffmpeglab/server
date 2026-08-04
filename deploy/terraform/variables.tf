variable "vault_address" {
  description = "Vault address. The token comes from VAULT_TOKEN or the usual Vault environment."
  type        = string
  default     = "http://127.0.0.1:8200"
}

variable "vault_token" {
  description = "Vault token used to list the registry. Set it through TF_VAR_vault_token rather than a file."
  type        = string
  sensitive   = true
}

variable "tenant_mount" {
  description = "kv-v2 mount holding the tenant registry."
  type        = string
  default     = "tenants"
}

variable "kubeconfig_path" {
  type    = string
  default = "~/.kube/config"
}

variable "kube_context" {
  type    = string
  default = "minikube"
}

variable "chart_path" {
  description = "Path to the tenant chart. Empty means the chart next to this module."
  type        = string
  default     = ""
}

variable "namespace_prefix" {
  description = "One namespace per tenant, named <prefix><tenant>."
  type        = string
  default     = "ffmpeglab-"
}

variable "manage_secrets" {
  description = <<-EOT
    Whether Terraform copies each tenant's credentials from Vault into a
    Kubernetes Secret. Convenient, but it puts those credentials in the
    Terraform state — encrypt the state or hand this job to External Secrets
    Operator and set this to false.
  EOT
  type        = bool
  default     = true
}

variable "chart_values" {
  description = "Extra chart values applied to every tenant."
  type        = any
  default     = {}
}
