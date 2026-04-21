# Architecture — MCP Server

> Understanding the MCP server design and data flow

---

## High-Level Architecture

```
Claude Desktop / HTTP Client
        ↓
    Stdio or SSE Transport
        ↓
    MCP Server
        ├── Tool Registry (5 tools)
        ├── Resource Provider (3 resources)
        └── Database Provider (Postgres/InMemory)
```

---

## Components

### 1. Transport Layer

**Stdio (StdioServerTransport)**
- Used by Claude Desktop
- Read/write on stdin/stdout
- `npm run dev:stdio`

**SSE (Express HTTP Server)**
- Remote HTTP access
- REST endpoints for tools/resources
- `npm run dev:sse` on port 8300

Both use the same business logic layer (ToolRegistry, ResourceProvider).

### 2. Tool Registry

Manages all AI-invokable actions:

```typescript
ToolRegistry
  ├── echo                    // Test tool
  ├── database_query          // SELECT queries
  ├── data_analysis           // Statistical analysis
  ├── http_api                // HTTP requests
  └── portfolio_health        // Service health checks
```

**Input Validation:** Zod schemas prevent invalid inputs before execution.

### 3. Resource Provider

Exposes read-only data:

```
database://schema           ← Database tables and columns
mcp://capabilities          ← Server tools and resources
portfolio://services        ← AI portfolio services
```

### 4. Database Provider (Strategy Pattern)

```typescript
DatabaseProvider (interface)
  ├── PostgresProvider        // Real PostgreSQL
  └── InMemoryDatabaseProvider // Development/testing
```

**Factory:** `createDatabaseProvider(config)` returns the appropriate implementation.

---

## Data Flow

### Tool Execution (HTTP/SSE)

```
Client POST /tools/database_query/call
  ↓
Express route handler validates path
  ↓
ToolRegistry.executeTool("database_query", input)
  ↓
DatabaseQueryInputSchema.parse(input)  // Zod validation
  ↓
database.query(sql, params)
  ↓
DatabaseProvider executes SQL
  ↓
Return results as JSON
```

### Tool Execution (Stdio)

```
Claude Desktop sends JSON-RPC
  ↓
MCP Server receives tools/call request
  ↓
ToolRegistry.executeTool(name, args)
  ↓
Return results as JSON-RPC response
  ↓
Claude Desktop receives tool output
```

### Resource Reading

```
Client GET /resources/database%3A%2F%2Fschema
  ↓
Express route extracts URI
  ↓
ResourceProvider.readResource("database://schema")
  ↓
Return static JSON
```

---

## Type Safety

### Config Validation (Zod)

```typescript
const config = ConfigSchema.parse(process.env)
// Throws if invalid at runtime
```

Equivalent to Python's Pydantic Settings. Config errors caught at startup.

### Tool Input Validation

```typescript
const input = DatabaseQueryInputSchema.parse(userInput)
// Throws if query is missing or wrong type
```

### Type Annotations

```typescript
async executeTool(name: string, input: Record<string, unknown>): Promise<string>
// TypeScript enforces function contracts at compile time
```

---

## Database Safety

### Query Validation

**SQL Injection Protection:**
```typescript
// Allowed: parameterized queries
database.query("SELECT * FROM products WHERE id = $1", [userId])

// Blocked: inline values
// "SELECT * FROM products WHERE id = " + userId
```

### Read-Only Enforcement

In `InMemoryDatabaseProvider`:
```typescript
if (!normalized.startsWith("select")) {
  throw new Error("Only SELECT queries are allowed")
}
```

**For PostgreSQL:** Use a read-only database user.

---

## Error Handling

### Tool Execution Errors

```typescript
// In ToolRegistry.executeTool()
try {
  result = await registry.executeTool(name, input)
  res.json({ success: true, result })
} catch (error) {
  logger.error("Tool execution error", { tool: name, error })
  res.status(400).json({ success: false, error: error.message })
}
```

### Validation Errors

```typescript
// Zod throws ZodError with detailed path + message
try {
  DatabaseQueryInputSchema.parse(input)
} catch (error) {
  // error.issues[0].path = ["query"]
  // error.issues[0].message = "Required"
}
```

---

## Performance Characteristics

| Operation | Time | Notes |
|-----------|------|-------|
| Database query (10 rows) | 5-20ms | In-memory faster than Postgres |
| HTTP API call | 100-500ms | Network-dependent |
| Portfolio health check (3 services) | 50-150ms | 5s timeout per service |
| Tool execution (with streaming) | Real-time | SSE events sent as data processes |

---

## Security Considerations

1. **Input Validation:** Zod schemas catch malformed input
2. **SQL Injection:** Parameterized queries with `$1`, `$2` placeholders
3. **Code Injection:** No `eval()`, `Function()`, or dynamic SQL
4. **Read-Only:** SELECT-only enforcement
5. **Network:** HTTP in dev, HTTPS in production (add to Terraform)

---

## Extension Points

### Adding a New Tool

1. Add input schema to `src/types.ts`
2. Register in `ToolRegistry.registerDefaultTools()`
3. Implement execute method in `ToolRegistry.executeTool()`
4. Write tests in `tests/tools.test.ts`

### Adding a New Resource

1. Add resource URI to `ResourceProvider.getAvailableResources()`
2. Implement read logic in `ResourceProvider.readResource()`
3. Write tests in `tests/resources.test.ts`

### Switching to PostgreSQL

1. Update `.env`: `POSTGRES_HOST`, `POSTGRES_USER`, etc.
2. `createDatabaseProvider()` automatically returns `PostgresProvider`
3. No code changes needed

---

**Next:** [Getting Started Guide](../setup-and-tooling/getting-started.md)
