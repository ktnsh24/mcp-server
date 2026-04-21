variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-west-1"
}

variable "ecs_cluster_name" {
  description = "ECS cluster name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for ECS tasks"
  type        = list(string)
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for ALB"
  type        = list(string)
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
