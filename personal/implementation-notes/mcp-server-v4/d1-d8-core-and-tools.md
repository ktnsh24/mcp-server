# Implementation Notes — D1-D8: MCP Core & Tools

> **Scope:** Configuration, logging, tool registry, database providers
> **Key files:** `src/config.ts`, `src/logger.ts`, `src/tools/registry.ts`, `src/database/provider.ts`

---

## D1-D2: TypeScript Setup & Configuration

### What Was Built

- `package.json` with 21 dependencies (MCP SDK, Zod, Express, PostgreSQL, Winston)
- `tsconfig.json` with `strict: true`, ES2022 target, Node16 modules
- Configuration validation using Zod (equivalent to Python's Pydantic Settings)

### Design Decisions

**Why Zod over another validation library?**

| Library | Size | Runtime Validation | TypeScript Support |
|---------|------|-------------------|------------------|
| **Zod** | ~25KB | Yes | Excellent |
| **io-ts** | ~50KB | Yes | Complex |
| **Validator.js** | ~30KB | Yes | No types |
| **joi** | ~200KB | Yes | Limited |

Zod is lightweight, has TypeScript inference, and has the best DX for schemas.

**Configuration structure:**

```typescript
ConfigSchema = z.object({
  transport: z.enum(["stdio", "sse"]),
  cloudProvider: z.enum(["aws", "azure", "local"]),
  postgres: z.object({ host, port, database, user, password }),
  // ... 10+ more fields
})
```

Each field is validated at startup. Invalid env vars throw immediately.

### Winston Logger

```typescript
format: winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
)
```

- Timestamps on all logs
- Stack traces for errors
- Colors in development, JSON in production (stdio)

---

## D3-D4: Types & Input Validation

### What Was Built

- Zod schemas for all tool inputs (echo, database_query, data_analysis, http_api, portfolio_health)
- TypeScript interfaces for database schema, resources, health status
- MCP-specific types (ToolResult, PromptMessage, HealthStatus)

### Input Schema Examples

```typescript
DatabaseQueryInputSchema = z.object({
  query: z.string().describe("SQL SELECT query"),
  params: z.array(z.union([z.string(), z.number()])).optional(),
})

// At runtime:
DatabaseQueryInputSchema.parse({
  query: "SELECT * FROM products",
  params: [1, 2, 3]
})
// ✓ valid

DatabaseQueryInputSchema.parse({
  query: 123  // wrong type
})
// ✗ throws ZodError with details
```

**Why `.describe()`?** MCP uses descriptions to inform the LLM about what each field means. This is used in tool prompts to the AI.

---

## D5-D6: Database Providers (Strategy Pattern)

### What Was Built

- `DatabaseProvider` interface with 4 methods: `connect()`, `disconnect()`, `query()`, `getSchema()`
- `PostgresProvider` — Real PostgreSQL via `pg` library
- `InMemoryDatabaseProvider` — Sample tables (products, orders) seeded in memory

### InMemoryDatabaseProvider

```typescript
class InMemoryDatabaseProvider implements DatabaseProvider {
  private tables: Map<string, Record<string, unknown>[]> = new Map()

  private seedSampleData(): void {
    this.tables.set("products", [
      { id: 1, name: "Wireless Earbuds", price: 29.99, stock: 150 },
      // ... 9 more products
    ])
    this.tables.set("orders", [...])
  }

  async query(sql: string): Promise<...[]> {
    // Simple SQL parser for SELECT queries
    const tableName = /* extract from sql */
    return this.tables.get(tableName)
  }
}
```

**Why this level of detail?** Testing and demos need data without external dependencies. The in-memory provider is good enough for Labs 1-4.

### PostgresProvider

```typescript
async query(sql: string, params?: unknown[]): Promise<...[]> {
  if (!this.pool) throw new Error("Not connected")
  const result = await this.pool.query(sql, params)
  return result.rows
}

async getSchema(): Promise<SchemaInfo[]> {
  // Query information_schema.tables and information_schema.columns
}
```

Uses native PostgreSQL parameterized queries (`$1`, `$2`, etc.) to prevent SQL injection.

---

## D7: Tool Registry

### What Was Built

- `ToolRegistry` class managing all tools
- 5 tools with input validation and execution:
  1. **echo** — Simple text echo
  2. **database_query** — Execute SELECT queries
  3. **data_analysis** — Statistical analysis (summary, top_n, distribution)
  4. **http_api** — Make HTTP requests with timeout
  5. **portfolio_health** — Check service health

### Tool Execution Flow

```typescript
async executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "database_query":
      return await this.executeQuery(input)
    // ...
  }
}

private async executeQuery(input: Record<string, unknown>): Promise<string> {
  const parsed = DatabaseQueryInputSchema.parse(input) // Validate
  if (!parsed.query.trim().toUpperCase().startsWith("SELECT")) {
    throw new Error("Only SELECT queries allowed") // Security
  }
  const results = await this.database.query(parsed.query, parsed.params)
  return JSON.stringify(results, null, 2) // Return as JSON string
}
```

**Key pattern:** Validate → Enforce rules → Execute → Serialize.

### HTTP API Tool

Uses native `fetch()` (Node.js 18+) with timeout:

```typescript
const controller = new AbortController()
const timeoutId = setTimeout(() => controller.abort(), parsed.timeout)
try {
  const response = await fetch(parsed.url, {
    method: parsed.method,
    headers: parsed.headers,
    body: parsed.body,
    signal: controller.signal,
  })
  // ... handle response
} finally {
  clearTimeout(timeoutId)
}
```

**Why AbortController?** Standard way to cancel async operations. Prevents hanging requests.

---

## D8: Resource Provider

### What Was Built

- `ResourceProvider` class exposing 3 resources:
  1. `database://schema` — Database tables and columns
  2. `mcp://capabilities` — Server tools and resources
  3. `portfolio://services` — Portfolio services (gateway, agent, chatbot)

### Resource Reading

```typescript
async readResource(uri: string): Promise<string> {
  switch (uri) {
    case "database://schema":
      return this.getSchemaResource() // JSON string
    case "mcp://capabilities":
      return this.getCapabilitiesResource()
    default:
      throw new Error(`Unknown resource: ${uri}`)
  }
}

private getSchemaResource(): string {
  return JSON.stringify({
    tables: [
      {
        name: "products",
        columns: [
          { name: "id", type: "integer" },
          // ...
        ]
      },
      // ...
    ]
  }, null, 2)
}
```

**Why return strings, not objects?** MCP spec requires resource content as strings. JSON.stringify() is implicit serialization.

---

## Testing Strategy

| Component | Test File | Tests | Approach |
|-----------|----------|-------|----------|
| Database | `database.test.ts` | 7 | InMemory CRUD, SQL parser safety |
| Tools | `tools.test.ts` | 8 | Input validation, tool execution, error handling |
| Resources | `resources.test.ts` | 5 | Resource listing, reading, unknown URIs |

**Test execution:** Vitest (TypeScript test runner, similar to Jest).

---

## Key Patterns Established

1. **Zod validation** — Runtime type checking, identical to Pydantic
2. **Strategy pattern** — Database providers (InMemory/Postgres)
3. **Factory functions** — `createDatabaseProvider(config)` selects implementation
4. **JSON serialization** — All tool outputs are JSON strings
5. **Error safety** — Query validation, timeout handling, input schemas
