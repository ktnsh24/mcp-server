# ─── Security Groups ────────────────────────────────────────────

resource "aws_security_group" "alb" {
  name   = "mcp-server-alb-sg"
  vpc_id = var.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "mcp-server-alb-sg"
  }
}

resource "aws_security_group" "mcp_server" {
  name   = "mcp-server-sg"
  vpc_id = var.vpc_id

  ingress {
    from_port       = 8300
    to_port         = 8300
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "mcp-server-sg"
  }
}
