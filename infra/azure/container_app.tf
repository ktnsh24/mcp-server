# ─── Container Registry ─────────────────────────────────────────

resource "azurerm_container_registry" "mcp_server" {
  name                = replace("mcp${var.resource_group_name}", "-", "")
  resource_group_name = azurerm_resource_group.mcp_server.name
  location            = azurerm_resource_group.mcp_server.location
  sku                 = "Standard"
  admin_enabled       = true
}

# ─── Log Analytics Workspace ────────────────────────────────────

resource "azurerm_log_analytics_workspace" "mcp_server" {
  name                = "log-mcp-server"
  location            = azurerm_resource_group.mcp_server.location
  resource_group_name = azurerm_resource_group.mcp_server.name
  sku                 = "PerGB2018"
  retention_in_days   = 7
}

# ─── Container Apps Environment ────────────────────────────────

resource "azurerm_container_app_environment" "mcp_server" {
  name                           = "cae-mcp-server"
  location                       = azurerm_resource_group.mcp_server.location
  resource_group_name            = azurerm_resource_group.mcp_server.name
  log_analytics_workspace_id     = azurerm_log_analytics_workspace.mcp_server.id
  infrastructure_subnet_id       = var.container_apps_subnet_id
  internal_load_balancer_enabled = false
}

# ─── Container App ─────────────────────────────────────────────

resource "azurerm_container_app" "mcp_server" {
  name                         = "mcp-server"
  container_app_environment_id = azurerm_container_app_environment.mcp_server.id
  resource_group_name          = azurerm_resource_group.mcp_server.name
  revision_mode                = "Single"

  identity {
    type = "SystemAssigned"
  }

  template {
    container {
      name   = "mcp-server"
      image  = "${azurerm_container_registry.mcp_server.login_server}/mcp-server:latest"
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name  = "MCP_TRANSPORT"
        value = "sse"
      }
      env {
        name  = "MCP_PORT"
        value = "8300"
      }
      env {
        name  = "LOG_LEVEL"
        value = "info"
      }
      env {
        name  = "CLOUD_PROVIDER"
        value = "azure"
      }
      env {
        name  = "AZURE_LOCATION"
        value = azurerm_resource_group.mcp_server.location
      }
    }

    min_replicas = 1
    max_replicas = 3
  }

  ingress {
    allow_insecure_connections = false
    external_enabled           = true
    target_port                = 8300
    transport                  = "http"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }
}
