# Hands-on Labs — Phase 2: Advanced MCP Features

> **Labs 5-8:** Claude Desktop integration, SSE streaming, provider switching, Docker
>
> **Time:** ~2.5 hours total

---

## Table of Contents

- [Lab 5: Claude Desktop Integration](#lab-5-claude-desktop-integration)
- [Lab 6: SSE Streaming](#lab-6-sse-streaming)
- [Lab 7: Provider Switching](#lab-7-provider-switching)
- [Lab 8: Docker Deployment](#lab-8-docker-deployment)

---

## 🚚 The Courier Analogy — Understanding Phase 2 MCP Operations

| Metric | 🚚 Courier Analogy | What It Means for MCP | How It's Calculated |
|--------|-------------------|------------------------|---------------------|
| **Stdio Transport** | Direct depot door — walk right in | Claude Desktop connects to tools via process stdin/stdout | Spawn server process → send JSON-RPC on stdin → read response from stdout |
| **SSE Streaming** | Live progress updates from the dispatch centre | Real-time event stream for long-running tool executions | `GET /sse` → verify `text/event-stream` content type → count events |
| **Provider Switching** | Swaps storage facilities without changing tool contracts | Swap backend (InMemory ↔ PostgreSQL) without altering tool API | Change `STORAGE_PROVIDER` env → re-run same tool calls → verify identical results |
| **Docker Deployment** | Packages the whole dispatch centre for reproducible deployment | Containerised MCP server with all dependencies included | `docker compose up` → build image → verify `/health` + tool availability |

---

## Lab 5: Claude Desktop Integration

> 🏢 **Business Context:** Product managers want to use MCP tools directly from Claude Desktop — no API clients or terminals needed.

### Steps

1. **Configure Claude Desktop**

Create `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ai-portfolio": {
      "command": "node",
      "args": ["/path/to/repos/mcp-server/dist/index.js", "--transport", "stdio"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

2. **Build the server**

```bash
cd repos/mcp-server
npm run build
```

3. **Restart Claude Desktop**

Close and reopen. Look for MCP tools in Claude's tool picker.

### Test in Claude

Ask Claude:
- "Use the echo tool to say hello"
- "Query the products database for all items over $50"
- "What is the database schema?"
- "Check the health of portfolio services"

### Verify

- [ ] Claude Desktop shows MCP tools in the tools dropdown
- [ ] Echo tool works from Claude
- [ ] Database queries return real results
- [ ] Resources are accessible

### 🧠 Certification Question

**Q: What AWS service enables serverless function invocation similar to MCP's stdio transport?**
A: AWS Lambda invoke — direct invocation via SDK. Stdio is like Lambda's synchronous invoke: request in, response out, no HTTP overhead.

### What you learned

Claude Desktop connects via `stdio` — a zero-config transport with no HTTP overhead. Once wired, users call MCP tools directly from Claude's chat.

**✅ Skill unlocked:** You can configure Claude Desktop MCP integration and verify tool availability.

---

## Lab 6: SSE Streaming

> 🏢 **Business Context:** The frontend team needs real-time updates when executing long-running tools like database analysis.

### Test Streaming

```bash
# Stream a database query execution
curl -N "http://localhost:8300/stream/tools/database_query?query=SELECT%20*%20FROM%20products"
```

### Expected SSE Events

```
data: {"event":"connected","tool":"database_query"}

data: {"event":"executing","tool":"database_query"}

data: {"event":"success","result":"[{\"id\":1,\"name\":\"Wireless Earbuds\",...}]"}
```

### Compare SSE vs Regular

```bash
# Regular (blocks until done)
time curl -s -X POST http://localhost:8300/tools/database_query/call \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT * FROM products"}'

# Streaming (events arrive immediately)
curl -N "http://localhost:8300/stream/tools/echo?message=Hello%20Stream"
```

### Verify

- [ ] SSE endpoint returns event stream
- [ ] Events arrive in order: connected → executing → success
- [ ] Error events include error details
- [ ] Stream closes after final event

### 🧠 Certification Question

**Q: Which AWS service supports server-to-client push similar to SSE?**
A: AppSync with WebSocket subscriptions, or API Gateway WebSocket API. SSE is simpler (one-directional) and works through CloudFront. Use AppSync when you need GraphQL subscriptions.

### What you learned

SSE delivers real-time progress events (connected → executing → success) for long-running tool calls. Clients see intermediate status without polling.

**✅ Skill unlocked:** You can consume SSE events and compare SSE vs regular tool calls.

---

## Lab 7: Provider Switching

> 🏢 **Business Context:** In production, we use PostgreSQL. In development, we use in-memory. The switch must be transparent.

### Test Strategy Pattern

```bash
# Start with InMemory (default)
MCP_TRANSPORT=sse npm run dev:sse
curl -s http://localhost:8300/health | jq

# Start with PostgreSQL
docker run -d --name mcp-postgres \
  -e POSTGRES_PASSWORD=mcp_pass \
  -e POSTGRES_DB=mcp_data \
  -p 5432:5432 \
  postgres:16-alpine

# Wait for PostgreSQL to start
sleep 5

# Restart with PostgreSQL
POSTGRES_HOST=localhost \
POSTGRES_USER=postgres \
POSTGRES_PASSWORD=mcp_pass \
POSTGRES_DB=mcp_data \
MCP_TRANSPORT=sse \
npm run dev:sse

# Same tool, different backend
curl -X POST http://localhost:8300/tools/database_query/call \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT 1 as connected"}' | jq

# Cleanup
docker stop mcp-postgres && docker rm mcp-postgres
```

### Verify

- [ ] InMemory provider works without external dependencies
- [ ] PostgreSQL provider connects when configured
- [ ] Same tool calls work with both providers
- [ ] Switching requires only env var changes

### 🧠 Certification Question

**Q: How does the Strategy Pattern relate to AWS's managed vs self-managed services?**
A: Same abstraction. RDS (managed) vs EC2 (self-hosted) PostgreSQL — your application code doesn't change. Our DatabaseProvider interface abstracts PostgreSQL vs InMemory, just like AWS abstracts managed vs unmanaged.

### What you learned

Switching from InMemory to PostgreSQL requires only env vars — no code changes. The Strategy Pattern keeps the tool interface stable regardless of backend.

**✅ Skill unlocked:** You can switch providers and explain the Strategy Pattern's production value.

---

## Lab 8: Docker Deployment

> 🏢 **Business Context:** DevOps needs the MCP server containerized for ECS deployment, with PostgreSQL as a sidecar.

### Build & Run

```bash
cd repos/mcp-server

# Build TypeScript first
npm run build

# Build Docker image
docker compose build

# Run
docker compose up -d

# Check logs
docker compose logs -f app

# Test
curl -s http://localhost:8300/health | jq

# Query (uses PostgreSQL now)
curl -X POST http://localhost:8300/tools/database_query/call \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT current_database()"}' | jq '.result'

# List tools
curl -s http://localhost:8300/tools | jq '.count'

# Cleanup
docker compose down -v
```

### Verify

- [ ] Docker image builds without errors
- [ ] Container starts and passes health check
- [ ] Tools execute correctly in container
- [ ] PostgreSQL container is accessible from app
- [ ] `docker compose down -v` cleans up volumes

### 🧠 Certification Question

**Q: What ECS task definition settings would you configure for the MCP server?**
A: CPU=256, Memory=512 (TypeScript is lightweight), port mapping 8300:8300, health check `curl -f http://localhost:8300/health`, depends_on PostgreSQL task, log driver=awslogs.

### What you learned

The TypeScript server + PostgreSQL run in Docker with health checks and volume cleanup. This maps directly to an ECS Fargate task definition.

**✅ Skill unlocked:** You can containerize the MCP server and verify end-to-end tool execution in Docker.

---

## Summary

| Lab | Feature | Key Learning |
|-----|---------|-------------|
| 5 | Claude Desktop | Stdio transport, native integration |
| 6 | SSE streaming | Server-sent events, real-time updates |
| 7 | Provider switching | Strategy pattern, InMemory vs PostgreSQL |
| 8 | Docker deployment | Container builds, service networking |

## Phase 2 Labs — Skills Checklist

| # | Skill | Lab | Can you explain it? |
|---|---|---|---|
| 1 | Claude Desktop MCP wiring (`stdio`) | Lab 5 | [ ] Yes |
| 2 | SSE streaming event lifecycle | Lab 6 | [ ] Yes |
| 3 | Backend provider switching strategy | Lab 7 | [ ] Yes |
| 4 | Containerized MCP deployment checks | Lab 8 | [ ] Yes |

**Previous:** [Phase 1 Labs](hands-on-labs-phase-1.md)
**Architecture:** [Architecture Overview](../architecture-and-design/architecture.md)
