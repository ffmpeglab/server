variable "project_id" {
  description = "Google Cloud project the cluster is created in."
  type        = string
}

variable "region" {
  description = "Region for regional resources."
  type        = string
  default     = "europe-west1"
}

variable "zone" {
  description = <<-EOT
    Zone for the cluster. A zonal cluster has one control plane instead of
    three, which is what the per-account free control plane covers.
  EOT
  type        = string
  default     = "europe-west1-b"
}

variable "cluster_name" {
  type    = string
  default = "ffmpeglab"
}

variable "machine_type" {
  description = <<-EOT
    Node size. Rendering is CPU bound, so this is the knob that decides how many
    concurrent renders a node can take. The smallest shared-core machines will
    technically run the pods and then take a very long time over any real file.
  EOT
  type        = string
  default     = "e2-standard-2"
}

variable "disk_size_gb" {
  description = "Node disk. Renders are written to it through emptyDir."
  type        = number
  default     = 50
}

variable "spot" {
  description = <<-EOT
    Spot nodes cost a fraction of on-demand and can be reclaimed at any time.
    Runners survive that: an interrupted render goes back to the queue.
  EOT
  type        = bool
  default     = true
}

variable "min_nodes" {
  type    = number
  default = 1
}

variable "max_nodes" {
  type    = number
  default = 3
}

variable "release_channel" {
  description = "RAPID, REGULAR, STABLE or UNSPECIFIED."
  type        = string
  default     = "REGULAR"
}

variable "deletion_protection" {
  description = "Terraform refuses to destroy the cluster while this is on."
  type        = bool
  default     = false
}
