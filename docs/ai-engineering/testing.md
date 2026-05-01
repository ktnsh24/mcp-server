# Testing Strategy & Inventory — MCP Server

> How the MCP Server is tested — unit tests for tools, resources, and database provider using Vitest with in-memory implementations.

**Related:** [Architecture](../architecture-and-design/architecture.md) · [Getting Started](../setup-and-tooling/getting-started.md)

**Shared baseline:** [Testing Playbook (portfolio-level)](../../../../docs/shared/ai-engineering/testing-playbook.md)

---

## Test Pyramid

```
        ╱ ╲           E2E (manual via MCP Inspector / Claude Desktop)
       ╱   ╲          Verify full stdio/SSE transport with real MCP client
      ╱─────╲
     ╱       ╲        Integration (9 tests)
    ╱         ╲       Tool registry: execution, validation, error handling
   ╱───────────╲
  ╱             ╲     Unit (12 tests)
 ╱               ╲    Database queries, resource reading, schema validation
╱─────────────────╲
```

---

## Running Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage

# Specific file
npx vitest run tests/tools.test.ts
```

---

## Test Inventory

### Unit + Integration Tests (3 files, 21 tests)

| File | Tests | What it covers |
|---|---|---|
| `database.test.ts` | 7 | InMemoryDatabaseProvider: connect, query products, sort, limit, schema, reject non-SELECT, unknown table |
| `resources.test.ts` | 5 | ResourceProvider: list resources, read schema/capabilities/portfolio, unknown resource |
| `tools.test.ts` | 9 | ToolRegistry: list tools, execute echo/database_query/data_analysis, Zod validation, unknown tool |

**Total: 3 files, 21 tests**

---

## Test Patterns

### 1. InMemoryDatabaseProvider

Tests use the real `InMemoryDatabaseProvider` which has sample products/orders data:

```typescript
const database = new InMemoryDatabaseProvider();
await database.connect();
const results = await database.query("SELECT * FROM products LIMIT 3");
```

### 2. Zod Schema Validation

Tool inputs are validated with Zod schemas — tests verify both valid and invalid inputs:

```typescript
const input = { query: "SELECT * FROM products" };
expect(() => DatabaseQueryInputSchema.parse(input)).not.toThrow();
```

### 3. Tool Registry Integration

The `ToolRegistry` is tested as an integration point — it aggregates tools, validates inputs, and dispatches to implementations:

```typescript
const result = await registry.executeTool("echo", { message: "hello" });
expect(result).toContain("hello");
```

---

## Known Limitations

| Limitation | Why | Mitigation |
|---|---|---|
| No stdio transport tests | Requires MCP client library | Manual testing with Claude Desktop |
| No SSE transport tests | Requires HTTP client + SSE parsing | Manual testing with MCP Inspector |
| No PostgreSQL tests | Requires running PostgreSQL | InMemoryDatabaseProvider covers the interface |
| No authentication tests | API key middleware not yet implemented | Planned for production hardening |

---

## DE Parallel — What This Looks Like at Scale

| Layer | What | Tools |
|---|---|---|
| **Transport tests** | Test stdio + SSE with real MCP clients | @modelcontextprotocol/sdk client |
| **Database tests** | Real PostgreSQL via Docker | Testcontainers |
| **Schema tests** | Validate all Zod schemas against MCP spec | Zod + JSON Schema comparison |
| **Load tests** | SSE connections under load | Artillery, k6 |
| **Contract tests** | Verify MCP protocol compliance | MCP conformance suite |
