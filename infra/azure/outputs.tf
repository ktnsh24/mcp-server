output "container_app_url" {
  description = "Container App URL"
  value       = azurerm_container_app.mcp_server.ingress[0].fqdn
}

output "container_registry_url" {
  description = "Container Registry URL"
  value       = azurerm_container_registry.mcp_server.login_server
}

output "log_analytics_workspace_id" {
  description = "Log Analytics workspace ID"
  value       = azurerm_log_analytics_workspace.mcp_server.id
}

output "postgresql_server_fqdn" {
  description = "PostgreSQL server FQDN"
  value       = azurerm_postgresql_flexible_server.mcp_data.fqdn
}
