variable "resource_group_name" {
  description = "Azure resource group name"
  type        = string
  default     = "rg-mcp-server"
}

variable "location" {
  description = "Azure location"
  type        = string
  default     = "westeurope"
}

variable "container_apps_subnet_id" {
  description = "Subnet ID for Container Apps environment"
  type        = string
}

variable "db_admin_user" {
  description = "PostgreSQL admin username"
  type        = string
  sensitive   = true
}

variable "db_admin_password" {
  description = "PostgreSQL admin password"
  type        = string
  sensitive   = true
}

# --- Cost Controller ---

variable "cost_limit_eur" {
  description = "Monthly budget limit in EUR — resources are killed when exceeded"
  type        = number
  default     = 5
}

variable "alert_email" {
  description = "Email address for budget alerts (80% warning + 100% kill notification)"
  type        = string
}
