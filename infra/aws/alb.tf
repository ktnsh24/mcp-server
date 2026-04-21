# ─── Load Balancer ──────────────────────────────────────────────

resource "aws_lb" "mcp_server" {
  name               = "mcp-server-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids

  tags = {
    Name = "mcp-server-alb"
  }
}

resource "aws_lb_target_group" "mcp_server" {
  name        = "mcp-server-tg"
  port        = 8300
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 5
    interval            = 30
    path                = "/health"
    matcher             = "200"
  }

  tags = {
    Name = "mcp-server-tg"
  }
}

resource "aws_lb_listener" "mcp_server" {
  load_balancer_arn = aws_lb.mcp_server.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.mcp_server.arn
  }
}
