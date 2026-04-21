# ─── CloudWatch Log Group ───────────────────────────────────────

resource "aws_cloudwatch_log_group" "mcp_server" {
  name              = "/ecs/mcp-server"
  retention_in_days = 7

  tags = {
    Name = "mcp-server-logs"
  }
}
