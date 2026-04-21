# Implementation Notes — Analysis Phase: MCP Server

> **Jira stories:** [jira-stories-mcp-server.md → Phase 0](../../jira-stories/jira-stories-mcp-server.md)
> **Purpose:** This document captures **why each design decision was made** for the MCP server project.

---

## Table of Contents

1. [Why MCP?](#1-why-mcp)
2. [A1 — Language Choice: Why TypeScript](#a1--language-choice-why-typescript)
3. [A2 — Tool Design: Why These 5 Tools](#a2--tool-design-why-these-5-tools)
4. [A3 — Transport: Why Stdio + SSE](#a3--transport-why-stdio--sse)
5. [A4 — Database: Why Strategy Pattern](#a4--database-why-strategy-pattern)
6. [How Analysis Fed Into Implementation](#5-how-analysis-fed-into-implementation)

---

## 1. Why MCP?

### The Problem

Phases 1-3 (RAG Chatbot, Gateway, Agent) work great but each has its own tool interface:

- **RAG Chatbot** has knowledge base tools (vector search, document retrieval)
- **AI Gateway** routes LLM calls but doesn't expose tools
- **AI Agent** has hardcoded tools (calculator, database query, web search)

If you want to:
- Add a new tool → modify agent code
- Share tools across projects → duplicate code
- Connect AI to external services → build custom integrations

### The Solution: MCP (Model Context Protocol)

MCP is an emerging standard (released late 2024 by Anthropic):

| Without MCP | With MCP |
|------------|----------|
| Agent has hardcoded tools | Agent connects to MCP servers for tools |
| Tool changes = code changes | Tool changes = server changes |
| One-off integrations | Standardized tool interface |
| No AI client integration | Works with Claude, ChatGPT, custom clients |

### Why Phase 4?

The MCP server sits between agents and tools:
- Phase 1-3: Individual applications with embedded tools
- Phase 4: Standardized tool interface (MCP server)
- Phase 5: Multi-agent orchestration using Phase 4 tools

---

## A1 — Language Choice: Why TypeScript

### The Question

> "Should I build the MCP server in Python or TypeScript?"

### Options Evaluated

| Language | Pros | Cons |
|----------|------|------|
| **Python** | Same as Phases 1-3, reuse patterns | MCP SDK is TypeScript-primary |
| **TypeScript** | Native MCP SDK support, Node.js ecosystem | First TypeScript project, learning curve |
| **Both** | Flexibility | Over-engineered |

### Decision: TypeScript

1. **MCP SDK native** — Anthropic's official SDK is TypeScript. Python support is unofficial.
2. **Node.js async** — `async/await` in Node.js is identical to Python's. Easy mental model transfer.
3. **Portfolio breadth** — Learning TypeScript adds tooling diversity (Python, TypeScript, Terraform, SQL).
4. **Certification** — AWS certifications expect familiarity with multiple languages.
5. **Real-world** — Most MCP servers (GitHub, filesystem, PostgreSQL official) are TypeScript.

### What I Would Not Do

Don't use the unofficial Python MCP SDK. The TypeScript SDK is battle-tested and regularly updated.

---

## A2 — Tool Design: Why These 5 Tools

### The Question

> "Which tools should the MCP server expose?"

### Decision Matrix

| Tool | Use Case | Priority |
|------|----------|----------|
| **echo** | Test connectivity | Essential (health check) |
| **database_query** | Data access | Essential (every portfolio app needs data) |
| **data_analysis** | Statistical queries | High (business analytics) |
| **http_api** | External integrations | High (Tavily, Slack, etc.) |
| **portfolio_health** | Service monitoring | Medium (observability) |

### Why NOT Include

- **File operations** — Security risk; use S3 instead
- **ML model inference** — Out of scope; use gateway for LLM
- **Message queues** — Use EventBridge/Pub-Sub instead
- **Authentication** — Out of scope; handle at transport layer

### Tool Input Safety

**Calculator tool:** Removed from Phase 4. Reason: Tools shouldn't have side effects. Calculator is stateless math (Phase 3 agent owns it). MCP tools should be integration points: databases, APIs, file systems.

---

## A3 — Transport: Why Stdio + SSE

### The Question

> "How should clients connect to the MCP server?"

### Options Evaluated

| Transport | Use Case | Connection Model |
|-----------|----------|-----------------|
| **Stdio** | Claude Desktop, local testing | stdin/stdout, JSON-RPC |
| **SSE** | HTTP clients, remote access | HTTP long-poll, server → client |
| **WebSocket** | Bidirectional, streaming | Full-duplex, real-time |
| **gRPC** | Performance-critical | Binary protocol, streaming |

### Decision: Stdio + SSE

1. **Stdio for Claude Desktop** — The killer app for MCP. Direct integration, no HTTP overhead.
2. **SSE for HTTP clients** — Agents (Phase 3) and Multi-Agent (Phase 5) access tools over HTTP.
3. **Not WebSocket** — Unidirectional (server → client) is sufficient. WebSocket adds complexity.

### Implementation

```typescript
// Same business logic (ToolRegistry, ResourceProvider)
if (config.transport === "stdio") {
  const { server, transport } = await createMcpServer(...)
  await startMcpServer(server, transport, logger)
} else {
  const server = createSseServer(...)
  server.listen(config.port)
}
```

The separation means:
- Changing transports = environment variable only
- Same tools work everywhere
- Extensible for future transports (WebSocket, gRPC)

---

## A4 — Database: Why Strategy Pattern

### The Question

> "Should the database provider be pluggable?"

### Options Evaluated

| Approach | Dev Experience | Production Ready | Flexibility |
|----------|-----------------|-----------------|-------------|
| **Only Postgres** | Need DB setup | Production-ready | Locked in |
| **Only InMemory** | Zero setup | Not production | Limited |
| **Strategy Pattern** | Zero setup (default InMemory) | Production option (switch to Postgres) | Maximum |

### Decision: Strategy Pattern

```typescript
interface DatabaseProvider {
  connect(): Promise<void>
  query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>
  getSchema(): Promise<SchemaInfo[]>
}

class PostgresProvider implements DatabaseProvider { ... }
class InMemoryDatabaseProvider implements DatabaseProvider { ... }

function createDatabaseProvider(config: Config): DatabaseProvider {
  if (config.postgres.host !== "localhost") {
    return new PostgresProvider(config, logger)
  }
  return new InMemoryDatabaseProvider()
}
```

**Benefits:**
1. **Dev friendly** — Start without setup
2. **Testable** — Mock database in tests
3. **Production path clear** — Replace InMemory with Postgres
4. **Zero code changes** — Just update env vars

This is identical to the LLM provider strategy in Phase 2.

---

## 5. How Analysis Fed Into Implementation

| Analysis Decision | Implementation |
|-------------------|-----------------|
| TypeScript for MCP SDK | Used `@modelcontextprotocol/sdk` as-is |
| Stdio + SSE transports | `src/server/mcp.ts` + `src/server/sse.ts` |
| 5 focused tools | `src/tools/registry.ts` with 5 execute methods |
| Resource provider | `src/resources/provider.ts` with 3 resources |
| Strategy pattern for DB | `src/database/provider.ts` with 2 implementations |
| Input validation | Zod schemas in `src/types.ts` |

---

## Key Learnings

### TypeScript vs Python

| Concept | Python | TypeScript |
|---------|--------|-----------|
| Optional type | `str \| None` | `string \| undefined` |
| Dictionary | `Dict[str, Any]` | `Record<string, unknown>` |
| Interface | `ABC` + `@abstractmethod` | `interface` keyword |
| Data validation | Pydantic | Zod |
| Async | `async def`, `await` | `async function`, `await` (identical) |
| Interfaces | ABC inheritance | TypeScript structural typing |

### MCP Insights

1. **Tools vs Resources** — Tools are executable (POST-like). Resources are readable (GET-like).
2. **Stdio is low-level** — JSON-RPC requests/responses over stdout/stdin. Requires careful logging to stderr.
3. **Strategy for transports** — Same business logic, different I/O layers.

### Certification Connections

| MCP Concept | AWS Service | Exam Domain |
|-------------|------------|-------------|
| MCP Server | Lambda | Compute — MCP as a Lambda-backed API |
| Tools | Systems Manager Documents | Management — parameterized actions |
| Resources | Glue Data Catalog | Analytics — metadata access |
| Transports | EventBridge + SNS | Integration — event-driven subscriptions |
| Database | RDS Proxy + RDS | Database — connection pooling, parameterized queries |
