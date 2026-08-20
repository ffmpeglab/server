terraform {
  required_version = ">= 1.3"

  required_providers {
    vault = {
      source  = "hashicorp/vault"
      version = "~> 4.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.30"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.13"
    }
    http = {
      source  = "hashicorp/http"
      version = "~> 3.4"
    }
  }
}

provider "vault" {
  address = var.vault_address

  # The provider otherwise mints a short-lived child token for itself, which the
  # deploy role is not allowed to do. The token it is given already expires with
  # the workflow run.
  skip_child_token = true
}

# An empty kubeconfig path means this is running inside the cluster, so the
# credentials come from the service account mounted into the pod. try() is
# needed because Terraform evaluates both sides of a conditional, and those
# files do not exist on a laptop.
locals {
  in_cluster       = var.kubeconfig_path == ""
  service_account  = "/var/run/secrets/kubernetes.io/serviceaccount"
  in_cluster_host  = "https://kubernetes.default.svc"
  in_cluster_token = try(file("/var/run/secrets/kubernetes.io/serviceaccount/token"), null)
  in_cluster_ca    = try(file("/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"), null)
}

provider "kubernetes" {
  config_path    = local.in_cluster ? null : var.kubeconfig_path
  config_context = local.in_cluster ? null : var.kube_context

  host                   = local.in_cluster ? local.in_cluster_host : null
  token                  = local.in_cluster ? local.in_cluster_token : null
  cluster_ca_certificate = local.in_cluster ? local.in_cluster_ca : null
}

provider "helm" {
  kubernetes {
    config_path    = local.in_cluster ? null : var.kubeconfig_path
    config_context = local.in_cluster ? null : var.kube_context

    host                   = local.in_cluster ? local.in_cluster_host : null
    token                  = local.in_cluster ? local.in_cluster_token : null
    cluster_ca_certificate = local.in_cluster ? local.in_cluster_ca : null
  }
}
