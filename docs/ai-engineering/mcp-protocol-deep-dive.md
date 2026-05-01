# MCP Protocol Deep Dive

> Understanding the Model Context Protocol: tools, resources, prompts, and transports

---

## What is MCP?

The Model Context Protocol (MCP) is a standard for connecting AI models to external tools and data. Released in late 2024 by Anthropic, MCP defines:

- **Tools** — Actions the AI can invoke (like POST endpoints)
- **Resources** — Read-only data the AI can access (like GET endpoints)
- **Prompts** — Reusable templates for AI interactions
- **Transports** — How clients connect to servers (stdio, SSE)

### MCP vs REST API

| Feature | REST API | MCP |
|---------|----------|-----|
| **Client** | Human (browser, Postman) | AI model (Claude, GPT) |
| **Discovery** | OpenAPI/Swagger docs | Protocol-level `tools/list` |
| **Invocation** | HTTP requests | JSON-RPC tool calls |
| **Data exposure** | API endpoints | Resources with URIs |
| **Authentication** | OAuth, API keys | Transport-level |

**Key insight:** MCP is designed for AI clients, not human clients. Tools include descriptions that help the AI understand when and how to use them.

---

## Protocol Architecture

```
┌─────────────┐     JSON-RPC      ┌────────────────┐
│  AI Client   │ ◄───────────────► │   MCP Server    │
│ (Claude,     │                   │                 │
│  ChatGPT,    │  tools/list       │  ToolRegistry   │
│  Agent)      │  tools/call       │  Resources      │
│              │  resources/list   │  Prompts        │
│              │  resources/read   │  Database       │
└─────────────┘                   └────────────────┘
```

### Message Flow (Tool Call)

```
1. Client → Server: tools/list
   Response: [{ name: "database_query", description: "...", inputSchema: {...} }]

2. AI decides to use tool based on description

3. Client → Server: tools/call { name: "database_query", arguments: { query: "..." } }
   Response: { content: [{ type: "text", text: "[{id: 1, ...}]" }] }

4. AI processes tool result and continues reasoning
```

---

## Tools

Tools are the core of MCP. Each tool has:

```typescript
{
  name: "database_query",
  description: "Execute a read-only SQL SELECT query against the database",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "SQL SELECT query" },
      params: { type: "array", description: "Query parameters" }
    },
    required: ["query"]
  }
}
```

### Our Tools

| Tool | Category | Safety |
|------|----------|--------|
| `echo` | Test | None needed |
| `database_query` | Data | SELECT-only, parameterized |
| `data_analysis` | Analytics | Read-only, table validation |
| `http_api` | Integration | Timeout, error handling |
| `portfolio_health` | Operations | Read-only health checks |

### Tool Execution Lifecycle

```
Input → Zod Validation → Security Check → Execute → Serialize → Return
```

Each step is a gate that prevents invalid or dangerous operations.

---

## Resources

Resources expose read-only data:

```typescript
{
  uri: "database://schema",
  name: "Database Schema",
  description: "Current database schema including all tables and columns",
  mimeType: "application/json"
}
```

### URI Scheme

```
database://schema           → Database metadata
mcp://capabilities          → Server capabilities
portfolio://services        → Portfolio service info
```

**Why URIs?** They follow the same pattern as web URLs (scheme://path). AI clients can discover and navigate resources.

---

## Transports

### Stdio (Local)

```
Process stdin  → JSON-RPC request  → MCP Server → JSON-RPC response → Process stdout
                                                                    → Logs to stderr
```

**Used by:** Claude Desktop, local development, testing
**Advantages:** No network, instant latency, process isolation

### SSE (Remote)

```
HTTP Client → POST /tools/call → Express Server → ToolRegistry → JSON response
           → GET /stream/...  → SSE events (connected, executing, success)
```

**Used by:** AI agents (Phase 3), Multi-agent (Phase 5), remote clients
**Advantages:** Standard HTTP, works through firewalls, enables streaming

---

## Zod Schemas (TypeScript Pydantic)

### Python Pydantic vs TypeScript Zod

```python
# Python (Pydantic)
class DatabaseQuery(BaseModel):
    query: str
    params: list[str | int] | None = None
```

```typescript
// TypeScript (Zod)
const DatabaseQuerySchema = z.object({
  query: z.string(),
  params: z.array(z.union([z.string(), z.number()])).optional(),
});
```

| Feature | Pydantic | Zod |
|---------|----------|-----|
| Runtime validation | ✅ | ✅ |
| Type inference | ✅ | ✅ |
| Descriptions | `Field(description=...)` | `.describe(...)` |
| Defaults | `Field(default=...)` | `.default(...)` |
| Coercion | `validator` | `.coerce` |

---

## Security Model

### Input Validation

Every tool call passes through Zod validation before execution. Invalid inputs throw immediately with details.

### SQL Injection Prevention

```typescript
// Blocked: non-SELECT queries
if (!normalized.startsWith("select")) {
  throw new Error("Only SELECT queries are allowed");
}

// Encouraged: parameterized queries
database.query("SELECT * FROM products WHERE id = $1", [userId]);
```

### HTTP Safety

```typescript
// Timeout prevents hanging requests
const controller = new AbortController();
setTimeout(() => controller.abort(), timeout);
fetch(url, { signal: controller.signal });
```

### No Code Execution

Unlike the agent's calculator (AST eval), MCP tools never execute arbitrary code. They query databases, call APIs, and read metadata.

---

## Certification Connections

| MCP Concept | AWS Service | How They're Similar |
|-------------|------------|-------------------|
| Tools | Lambda | AI invokes functions; Lambda is the execution engine |
| Resources | Glue Data Catalog | Metadata about available data |
| Prompts | CloudFormation Templates | Reusable parameterized templates |
| Stdio transport | Lambda invoke | Synchronous request/response |
| SSE transport | EventBridge + SNS | Event-driven push notifications |
| Input schemas | API Gateway validators | Request validation before execution |
| MCP Server | Step Functions | Orchestrates tools and data access |

---

**Related:** [Architecture](../architecture-and-design/architecture.md) · [Tool Use Deep Dive](../../../ai-agent/docs/ai-engineering/tool-use-deep-dive.md)
