# ─── Resource Group ─────────────────────────────────────────────

resource "azurerm_resource_group" "mcp_server" {
  name     = var.resource_group_name
  location = var.location

  tags = {
    project    = "ai-portfolio"
    service    = "mcp-server"
    managed_by = "terraform"
  }
}
