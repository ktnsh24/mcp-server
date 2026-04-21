# Implementation Notes — D9-D16: Transports, Infrastructure & Operations

> **Scope:** MCP server, SSE transport, Docker, Terraform, CI/CD
> **Key files:** `src/server/mcp.ts`, `src/server/sse.ts`, Dockerfile, infra/

---

## D9-D10: MCP Server (Stdio Transport)

### What Was Built

- `createMcpServer()` — Creates StdioServerTransport + Server with tools & resources
- `startMcpServer()` — Connects server and transport, handles graceful shutdown

### Stdio Implementation

```typescript
const transport = new StdioServerTransport()
const server = new Server({
  name: "ai-portfolio-mcp-server",
  version: "0.1.0",
})

// Register tools
server.setRequestHandler("tools/list", async () => ({
  tools: registry.getAllTools(),
}))

server.setRequestHandler("tools/call", async (request) => {
  const { name, arguments: args } = request.params
  const result = await registry.executeTool(name, args)
  return {
    content: [{ type: "text", text: result }],
  }
})

// Register resources
server.setRequestHandler("resources/list", async () => ({
  resources: resourceProvider.getAvailableResources(),
}))

// Connect
server.connect(transport)
```

**Why StdioServerTransport?** It handles the MCP protocol details (JSON-RPC message framing, error handling). We just register handlers.

### Logging Considerations

When using stdio transport, **all logging must go to stderr**:

```typescript
format: winston.format.combine(
  ...,
  // For stdio, log to stderr (stdout is for MCP protocol)
  stderrLevels: ["error", "warn", "info", "debug"]
)
```

If logs went to stdout, they'd corrupt the MCP message stream.

---

## D11-D13: SSE Transport (HTTP)

### What Was Built

- Express-based HTTP server on port 8300
- Health check: `GET /health`
- Tools endpoints: `GET /tools`, `POST /tools/:name/call`
- Resources endpoints: `GET /resources`, `GET /resources/:uri`
- Streaming: `GET /stream/tools/:name`

### Routes

```typescript
// Health
app.get("/health", (_req, res) => {
  res.json({
    status: "healthy",
    version: "0.1.0",
    transport: "sse",
    tools: toolRegistry.getAllTools().length,
  })
})

// Tool execution
app.post("/tools/:name/call", express.json(), async (req, res) => {
  const { name } = req.params
  try {
    const result = await toolRegistry.executeTool(name, req.body)
    res.json({ success: true, result })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
})

// Resource reading
app.get("/resources/:uri", async (req, res) => {
  const content = await resourceProvider.readResource(req.params.uri)
  res.json({
    uri: req.params.uri,
    mimeType: "application/json",
    content: JSON.parse(content),
  })
})
```

### SSE Streaming Endpoint

```typescript
app.get("/stream/tools/:name", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")

  res.write(`data: ${JSON.stringify({ event: "connected" })}\n\n`)

  // Simulate async execution with events
  toolRegistry.executeTool(name, req.query)
    .then(result => {
      res.write(`data: ${JSON.stringify({ event: "success", result })}\n\n`)
      res.end()
    })
    .catch(error => {
      res.write(`data: ${JSON.stringify({ event: "error", error })}\n\n`)
      res.end()
    })
})
```

**SSE Format:** Each event is `data: <JSON>\n\n`. Clients parse with EventSource API.

---

## D14: Application Factory

```typescript
async function main(): Promise<void> {
  const config = loadConfig()
  const logger = createLogger(config)

  const database = createDatabaseProvider(config, logger)
  await database.connect()

  if (config.transport === "stdio") {
    const { server, transport } = await createMcpServer(config, database, logger)
    await startMcpServer(server, transport, logger)
  } else {
    const toolRegistry = new ToolRegistry(config, database, logger)
    const resourceProvider = new ResourceProvider(logger)
    const httpServer = createSseServer(config, toolRegistry, resourceProvider, logger)

    process.on("SIGINT", async () => {
      await database.disconnect()
      httpServer.close()
      process.exit(0)
    })
  }
}
```

**Key pattern:** Config determines transport at runtime. Same components, different I/O layers.

---

## D15: Docker & Docker Compose

### Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production  # Install only dependencies, not devDependencies
COPY dist/ ./dist/            # Pre-built JavaScript
EXPOSE 8300
CMD ["node", "dist/index.js"]
```

**Why Alpine?** 400MB → 150MB image size. Smaller is faster to push/pull.

**Why `npm ci`?** Deterministic installs (uses package-lock.json). Better for CI/CD.

### Docker Compose

```yaml
services:
  app:
    build: .
    ports: ["8300:8300"]
    environment:
      - MCP_TRANSPORT=sse
      - POSTGRES_HOST=postgres  # Service name in compose
    depends_on: [postgres]

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_PASSWORD=mcp_pass
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

**Why `POSTGRES_HOST=postgres`?** Docker Compose creates a DNS entry for each service. The app container can resolve `postgres:5432`.

---

## D16: Terraform Infrastructure

### AWS Architecture

| Resource | Purpose |
|----------|---------|
| ECR | Docker image registry |
| ECS Task Definition | Container spec (CPU, memory, env vars) |
| ECS Service | Runs tasks in Fargate, manages scaling |
| ALB | Distributes traffic across tasks |
| Security Group | Firewall rules (port 8300) |
| IAM Roles | Permissions (CloudWatch Logs, ECR) |
| CloudWatch Logs | Centralized logging |

**Task Definition:**
```hcl
resource "aws_ecs_task_definition" "mcp_server" {
  cpu              = "256"       # 1/4 CPU
  memory           = "512"       # 512 MB RAM
  network_mode     = "awsvpc"    # Use VPC networking
  launch_type      = "FARGATE"   # Serverless containers
  
  execution_role_arn = aws_iam_role.ecs_task_execution_role.arn  # ECS permissions
  task_role_arn      = aws_iam_role.ecs_task_role.arn            # App permissions
}
```

### Azure Architecture

| Resource | Purpose |
|----------|---------|
| Container Registry | Docker image registry |
| Container Apps Environment | Managed Kubernetes-like compute |
| Container App | Deploy and auto-scale containers |
| PostgreSQL Flexible Server | Managed PostgreSQL |
| Log Analytics Workspace | Monitoring and logs |

**Container App:**
```hcl
resource "azurerm_container_app" "mcp_server" {
  cpu    = 0.25    # 1/4 CPU
  memory = "0.5Gi" # 512 MB RAM
  
  template {
    min_replicas = 1
    max_replicas = 3  # Auto-scale from 1-3 instances
  }

  ingress {
    external_enabled = true
    target_port      = 8300
  }
}
```

---

## CI/CD Pipeline

```yaml
jobs:
  lint:
    - npm run lint
    - npm run format:check
    - npm run typecheck
  test:
    - npm run test
  docker:
    - docker build -t mcp-server .
    - docker run --rm mcp-server  # Smoke test
```

**Three gates:** Code quality (lint) → Correctness (tests) → Buildability (Docker).

---

## Key Patterns Established

1. **Stdio vs SSE separation** — Same business logic, different transports
2. **Graceful shutdown** — SIGINT handler disconnects database
3. **Environment-driven transport** — `MCP_TRANSPORT` env var selects stdio or sse
4. **Docker best practices** — Alpine, `npm ci`, multi-stage ready
5. **Terraform parity** — AWS and Azure both deploy the same image
6. **Observability** — CloudWatch (AWS) and Log Analytics (Azure)
