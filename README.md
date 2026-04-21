# MCP Server — Model Context Protocol

> **Phase 4** of the AI Engineering Portfolio — A TypeScript MCP server implementing the Model Context Protocol with stdio and SSE transports, providing tools and resources to AI agents.

**Port:** 8300 · **Language:** TypeScript 5.x · **Framework:** Express + @modelcontextprotocol/sdk

---

## Quick Links

### Getting Started

| Document | Description |
|---|---|
| [Getting Started](docs/setup-and-tooling/getting-started.md) | Prerequisites, installation, first run |
| [Debugging Guide](docs/setup-and-tooling/debugging-guide.md) | VS Code debugger + inspector setup |

### Architecture & Design

| Document | Description |
|---|---|
| [Architecture Overview](docs/architecture-and-design/architecture.md) | System design, transport flow, component interaction |

### AI Engineering

| Document | Description |
|---|---|
| [MCP Protocol Deep Dive](docs/ai-engineering/mcp-protocol-deep-dive.md) | Protocol spec, message format, capabilities |
| [Transport Deep Dive](docs/ai-engineering/transport-deep-dive.md) | stdio vs SSE, connection lifecycle |

### Testing & Reference

| Document | Description |
|---|---|
| [Testing Strategy & Inventory](docs/ai-engineering/testing.md) | All tests — unit, integration, E2E |

---

## What Does This Project Do?

An **MCP server** that exposes AI-usable tools and resources via the open [Model Context Protocol](https://modelcontextprotocol.io):

1. **AI agent connects** → via stdio (local) or SSE (network)
2. **Discovers tools** → `list_tools` returns calculator, database_query, web_search
3. **Calls a tool** → `call_tool` with validated arguments (Zod schemas)
4. **Reads resources** → `list_resources` / `read_resource` for system config, metrics
5. **Gets results** → structured JSON responses with proper MCP framing

```
AI Agent (Phase 3)
    │
    ├─ stdio transport (local) ──────┐
    │                                │
    └─ SSE transport (network) ──────┤
                                     ▼
                              MCP Server
                              ├── Tool Registry
                              │   ├── calculator
                              │   ├── database_query
                              │   └── web_search
                              └── Resource Provider
                                  ├── system://config
                                  └── system://metrics
```

---

## Advanced Features

| Feature | What it does | Pattern |
|---|---|---|
| **Dual transport** | stdio for local IDEs, SSE for network agents | Transport abstraction |
| **Zod validation** | Every tool input validated with Zod schemas | Schema-first design |
| **Tool registry** | Extensible tool system with discovery | `ToolProvider` interface |
| **Resource provider** | Expose config + metrics as MCP resources | `ResourceProvider` interface |
| **Database abstraction** | SQLite (local) / PostgreSQL (cloud) | `DatabaseProvider` interface |
| **Health endpoint** | Express `/health` with component status | Independent of MCP protocol |
| **Graceful shutdown** | Proper cleanup of DB connections and transports | Signal handlers |

---

## Project Structure

```
mcp-server/
├── .github/workflows/          # CI/CD pipelines
├── docs/                       # Documentation (organised by topic)
│   ├── ai-engineering/         #   MCP protocol, transports, testing
│   ├── architecture-and-design/#   Architecture overview
│   └── setup-and-tooling/      #   Getting started, debugging
├── infra/                      # Terraform (AWS + Azure)
├── src/                        # Application source code
│   ├── index.ts                #   Entry point — transport selection + startup
│   ├── config.ts               #   Configuration loader (env vars + defaults)
│   ├── logger.ts               #   Structured logger (Winston)
│   ├── server.ts               #   MCP server setup + capability registration
│   ├── database/               #   Database providers
│   │   └── provider.ts         #   SQLite / PostgreSQL (strategy pattern)
│   ├── tools/                  #   MCP tools
│   │   ├── registry.ts         #   Tool discovery + dispatch
│   │   ├── calculator.ts       #   Safe math evaluator
│   │   ├── database-query.ts   #   Read-only SQL queries
│   │   └── web-search.ts       #   Web search (Tavily / mock)
│   └── resources/              #   MCP resources
│       └── provider.ts         #   System config + metrics resources
├── tests/                      # Vitest tests
│   ├── tools.test.ts           #   Tool execution tests
│   ├── resources.test.ts       #   Resource provider tests
│   └── config.test.ts          #   Configuration tests
├── package.json                # npm dependencies
├── tsconfig.json               # TypeScript configuration
├── Dockerfile                  # Container image
├── docker-compose.yml          # Full stack
└── .env.example                # Environment variable template
```

---

## API / Protocol

### MCP Protocol (stdio / SSE)

| Method | Description |
|---|---|
| `tools/list` | List all available tools with Zod schemas |
| `tools/call` | Execute a tool by name with validated arguments |
| `resources/list` | List available resources (config, metrics) |
| `resources/read` | Read a specific resource by URI |

### HTTP Endpoints (Express)

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check with component status |
| `GET` | `/sse` | SSE transport endpoint for MCP clients |
| `POST` | `/messages` | Message endpoint for SSE transport |

---

## Quick Start

```bash
# 1. Install dependencies
cd repos/mcp-server && npm install

# 2. Configure
cp .env.example .env

# 3. Run (SSE mode)
npm run dev
# → http://localhost:8300/health

# 4. Run (stdio mode)
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | npm run start:stdio
```

See [Getting Started](docs/setup-and-tooling/getting-started.md) for the full step-by-step guide.

### Run on AWS or Azure

```bash
# Deploy + run all labs + destroy (automated)
./scripts/run_cloud_labs.sh --provider aws --email you@example.com

# Custom budget limit (default €5)
./scripts/run_cloud_labs.sh --provider aws --email you@example.com --cost-limit 15
```

Results saved to `scripts/lab_results/<aws|azure>/`.

---

## Tech Stack

| Layer | AWS | Azure | Local |
|---|---|---|---|
| **Language** | TypeScript 5.x | TypeScript 5.x | TypeScript 5.x |
| **MCP SDK** | @modelcontextprotocol/sdk | @modelcontextprotocol/sdk | @modelcontextprotocol/sdk |
| **HTTP** | Express | Express | Express |
| **Database** | RDS PostgreSQL | Azure SQL | SQLite |
| **Validation** | Zod | Zod | Zod |
| **Container** | ECS Fargate | Container Apps | Docker |

---

## Design Patterns

| Pattern | Where | Why |
|---|---|---|
| **Strategy (Interface)** | `DatabaseProvider`, `ToolProvider`, `ResourceProvider` | Swap implementations |
| **Factory** | `createDatabase()`, `createToolRegistry()` | Single creation point |
| **Registry** | `ToolRegistry` aggregates tools | Extensible discovery |
| **Schema-First** | Zod schemas define tool inputs | Validation before execution |
| **Transport Abstraction** | stdio / SSE behind same MCP interface | Deploy anywhere |

---

## Documentation Structure

```
docs/
├── ai-engineering/                          ← Deep-dives + testing
│   ├── mcp-protocol-deep-dive.md           ← Protocol spec, messages
│   ├── transport-deep-dive.md              ← stdio vs SSE, lifecycle
│   └── testing.md                          ← Test strategy & inventory
├── architecture-and-design/                ← System design
│   └── architecture.md                     ← Architecture overview
└── setup-and-tooling/                      ← Getting started
    ├── getting-started.md                  ← Full setup guide
    └── debugging-guide.md                  ← Debugger setup
```

---

## Certification Relevance

| MCP Concept | AWS Service | Exam Relevance |
|---|---|---|
| Protocol design | API Gateway | SAA-C03: API patterns |
| Dual transport | ALB + NLB | SAA-C03: load balancer selection |
| Schema validation | JSON Schema (Step Functions) | SAA-C03: data validation |
| Database abstraction | RDS + DynamoDB | SAA-C03: database selection |
| Container deployment | ECS Fargate | SAA-C03: compute services |

---

**Phase:** Phase 4 (out of 5) · **Portfolio:** [Portfolio Overview](../../README.md)
