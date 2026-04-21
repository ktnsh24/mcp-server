output "ecr_repository_url" {
  description = "ECR repository URL"
  value       = aws_ecr_repository.mcp_server.repository_url
}

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = aws_lb.mcp_server.dns_name
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.mcp_server.name
}

output "cloudwatch_log_group_name" {
  description = "CloudWatch log group name"
  value       = aws_cloudwatch_log_group.mcp_server.name
}
