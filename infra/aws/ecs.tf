# ─── ECS Task Definition ─────────────────────────────────────────

resource "aws_ecs_task_definition" "mcp_server" {
  family                   = "mcp-server"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "mcp-server"
      image     = "${aws_ecr_repository.mcp_server.repository_url}:latest"
      essential = true
      portMappings = [
        {
          containerPort = 8300
          hostPort      = 8300
          protocol      = "tcp"
        }
      ]
      environment = [
        { name = "MCP_TRANSPORT", value = "sse" },
        { name = "MCP_PORT", value = "8300" },
        { name = "LOG_LEVEL", value = "info" },
        { name = "CLOUD_PROVIDER", value = "local" },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.mcp_server.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:8300/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])
}

# ─── ECS Service ────────────────────────────────────────────────

resource "aws_ecs_service" "mcp_server" {
  name            = "mcp-server"
  cluster         = var.ecs_cluster_name
  task_definition = aws_ecs_task_definition.mcp_server.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.mcp_server.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.mcp_server.arn
    container_name   = "mcp-server"
    container_port   = 8300
  }

  depends_on = [
    aws_lb_listener.mcp_server,
    aws_iam_role_policy.ecs_task_role_policy,
  ]

  tags = {
    Name = "mcp-server"
  }
}
