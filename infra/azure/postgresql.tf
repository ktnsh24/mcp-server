# ─── PostgreSQL Flexible Server ─────────────────────────────────

resource "azurerm_postgresql_flexible_server" "mcp_data" {
  name                   = "psql-mcp-data"
  location               = azurerm_resource_group.mcp_server.location
  resource_group_name    = azurerm_resource_group.mcp_server.name
  administrator_login    = var.db_admin_user
  administrator_password = var.db_admin_password
  database_charset       = "UTF8"
  database_collation     = "en_US.utf8"
  sku_name               = "B_Standard_B1s"
  storage_mb             = 32768
  version                = "14"
  backup_retention_days  = 7
  geo_redundant_backup_enabled = false

  tags = {
    Name = "mcp-data-db"
  }
}

resource "azurerm_postgresql_flexible_server_database" "mcp_data" {
  name      = "mcp_data"
  server_id = azurerm_postgresql_flexible_server.mcp_data.id
  collation = "en_US.utf8"
  charset   = "UTF8"
}
