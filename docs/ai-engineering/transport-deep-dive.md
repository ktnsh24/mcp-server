# Transport Deep Dive — stdio vs SSE

> **What:** The MCP server supports two transport modes — stdio for local IDE integration and SSE for network-accessible HTTP clients.
>
> **Why:** Different deployment scenarios need different transports. Claude Desktop uses stdio; remote agents use SSE.
>
> **Files:** `src/server/mcp.ts` (stdio), `src/server/sse.ts` (SSE), `src/index.ts` (transport selection)

**Related:** [MCP Protocol Deep Dive](mcp-protocol-deep-dive.md) · [Architecture](../architecture-and-design/architecture.md)

---

## Table of Contents

1. [Two Transports, One Server](#1-two-transports-one-server)
2. [stdio Transport](#2-stdio-transport)
3. [SSE Transport](#3-sse-transport)
4. [Transport Selection](#4-transport-selection)
5. [Message Flow Comparison](#5-message-flow-comparison)
6. [SSE Server Architecture](#6-sse-server-architecture)
7. [Connection Lifecycle](#7-connection-lifecycle)
8. [When to Use Which](#8-when-to-use-which)
9. [Certification Relevance](#9-certification-relevance)
10. [Cross-References](#10-cross-references)

---

## 1. Two Transports, One Server

The MCP protocol is transport-agnostic — the same tools and resources work identically over both transports:

```
                    ┌─────────────────────────┐
                    │     MCP Server Core      │
                    │  ┌───────┐ ┌──────────┐  │
                    │  │ Tools │ │ Resources│  │
                    │  └───────┘ └──────────┘  │
                    └────────┬────────┬────────┘
                             │        │
               ┌─────────────┤        ├─────────────┐
               │             │        │             │
        ┌──────┴──────┐                      ┌──────┴──────┐
        │   stdio     │                      │    SSE      │
        │ Transport   │                      │ Transport   │
        └──────┬──────┘                      └──────┬──────┘
               │                                    │
        Claude Desktop                        Remote Agent
        (local process)                    (HTTP over network)
```

---

## 2. stdio Transport

### How It Works

stdio (standard input/output) is the simplest transport — the MCP client spawns the server as a child process and communicates via stdin/stdout:

```
Claude Desktop                    MCP Server
     │                                │
     │──── spawn process ────────────►│
     │                                │
     │──── stdin: JSON-RPC request ──►│
     │                                │
     │◄── stdout: JSON-RPC response ──│
     │                                │
     │──── stdin: tools/list ────────►│
     │◄── stdout: [echo, db_query] ──│
     │                                │
     │──── stdin: tools/call ────────►│
     │◄── stdout: { result: "..." } ──│
```

### Implementation

```typescript
// src/server/mcp.ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

export async function createMcpServer(config, database, logger) {
  const transport = new StdioServerTransport();
  const server = new Server({
    name: "ai-portfolio-mcp-server",
    version: "0.1.0",
  });

  // Register tools + resources on the server...

  return { server, transport };
}

export async function startMcpServer(server, transport, logger) {
  server.connect(transport);  // Connects stdin/stdout
  logger.info("MCP server started and listening on stdio");
}
```

### Key Properties

| Property | Value |
|---|---|
| **Connection** | Process-local (parent → child) |
| **Serialisation** | JSON-RPC 2.0 over newline-delimited JSON |
| **Authentication** | None needed (same machine) |
| **Latency** | ~1ms (no network) |
| **Persistence** | Server lives as long as client process |
| **Use case** | Claude Desktop, VS Code extensions |

---

## 3. SSE Transport

### How It Works

SSE (Server-Sent Events) wraps the MCP server in an Express HTTP server, exposing REST endpoints for tools, resources, and streaming:

```
Remote Agent                    Express Server (port 8300)
     │                                │
     │── GET /health ────────────────►│ → { status: "healthy" }
     │                                │
     │── GET /tools ─────────────────►│ → [echo, database_query, ...]
     │                                │
     │── POST /tools/echo/call ──────►│ → { success: true, result: "..." }
     │                                │
     │── GET /resources ─────────────►│ → [database://schema, ...]
     │                                │
     │── GET /stream/tools/echo ─────►│ → SSE: connected → executing → result
```

### Implementation

```typescript
// src/server/sse.ts
export function createSseServer(config, toolRegistry, resourceProvider, logger) {
  const app = express();

  // REST endpoints
  app.get("/health", (_req, res) => { ... });
  app.get("/tools", (_req, res) => { ... });
  app.post("/tools/:name/call", async (req, res) => { ... });
  app.get("/resources", (_req, res) => { ... });

  // SSE streaming endpoint
  app.get("/stream/tools/:name", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Stream: connected → executing → success/error
    res.write(`data: ${JSON.stringify({ event: "connected" })}\n\n`);
    // ... execute tool and stream result
  });

  return app.listen(config.port);
}
```

### Key Properties

| Property | Value |
|---|---|
| **Connection** | HTTP over network |
| **Serialisation** | JSON (REST) + SSE (streaming) |
| **Authentication** | API key header (optional) |
| **Latency** | ~5–50ms (network dependent) |
| **Persistence** | Server runs independently |
| **Use case** | Remote agents, web clients, CI/CD |

---

## 4. Transport Selection

The entry point (`src/index.ts`) selects the transport based on configuration:

```typescript
async function main() {
  const config = loadConfig();  // MCP_TRANSPORT env var

  if (config.transport === "stdio") {
    // Stdio mode: for Claude Desktop
    const { server, transport } = await createMcpServer(config, database, logger);
    await startMcpServer(server, transport, logger);
  } else {
    // SSE mode: for HTTP access
    const toolRegistry = new ToolRegistry(config, database, logger);
    const resourceProvider = new ResourceProvider(logger);
    createSseServer(config, toolRegistry, resourceProvider, logger);
  }
}
```

### Configuration

```bash
# stdio mode (for Claude Desktop)
MCP_TRANSPORT=stdio npm start

# SSE mode (for HTTP access — default)
MCP_TRANSPORT=sse MCP_PORT=8300 npm start
```

---

## 5. Message Flow Comparison

### Tool Call: `echo("Hello")`

**stdio:**
```
Client → stdin:  {"jsonrpc":"2.0","method":"tools/call","params":{"name":"echo","arguments":{"message":"Hello"}},"id":1}
Server → stdout: {"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"Echo: Hello"}]},"id":1}
```

**SSE (REST):**
```
Client → POST /tools/echo/call  Body: {"message":"Hello"}
Server → 200 OK                 Body: {"success":true,"result":"Echo: Hello"}
```

**SSE (Streaming):**
```
Client → GET /stream/tools/echo?message=Hello
Server → text/event-stream:
         data: {"event":"connected","tool":"echo"}
         data: {"event":"executing","tool":"echo"}
         data: {"event":"success","result":"Echo: Hello"}
```

---

## 6. SSE Server Architecture

```
Express App (port 8300)
├── GET  /health              → Health check
├── GET  /tools               → List all tools
├── POST /tools/:name/call    → Execute tool (sync)
├── GET  /stream/tools/:name  → Execute tool (SSE stream)
├── GET  /resources           → List resources
├── GET  /resources/:uri      → Read resource
└── *    (404)                → Not found handler
```

### Why Express Instead of the MCP SDK's SSE Transport?

The `@modelcontextprotocol/sdk` has a built-in SSE transport, but we use Express directly because:

1. **REST endpoints** — We want standard REST alongside MCP (health checks, direct tool calls)
2. **Flexibility** — Express lets us add middleware (auth, logging, CORS)
3. **Portfolio value** — Shows both MCP protocol and REST API design

---

## 7. Connection Lifecycle

### stdio Lifecycle

```
1. Client spawns:    node dist/index.js --transport stdio
2. Server boots:     Connects database, registers tools
3. Server signals:   Ready on stdout
4. Client sends:     JSON-RPC messages on stdin
5. Server responds:  JSON-RPC responses on stdout
6. Client exits:     Server process terminates (child of client)
```

### SSE Lifecycle

```
1. Server starts:    npm run dev (listens on port 8300)
2. Server boots:     Connects database, registers tools
3. Client connects:  HTTP request to any endpoint
4. For streaming:    Client opens SSE connection (GET /stream/...)
5. Server pushes:    Events via text/event-stream
6. Client closes:    HTTP connection ends
7. Server persists:  Continues listening for new connections
```

---

## 8. When to Use Which

| Scenario | Transport | Why |
|---|---|---|
| Claude Desktop | **stdio** | Native MCP integration, no network |
| VS Code Copilot | **stdio** | Extension spawns server as child process |
| Remote AI agent (V3) | **SSE** | Agent connects over HTTP |
| CI/CD pipeline | **SSE** | Automated tool calls via HTTP |
| Web dashboard | **SSE** | Browser connects to streaming endpoint |
| Local testing | **SSE** | Easy to test with curl/Postman |

---

## 9. Certification Relevance

| Transport Concept | AWS Service | Exam Relevance |
|---|---|---|
| stdio (process IPC) | ECS task communication | SAA-C03: container networking |
| SSE (HTTP streaming) | API Gateway + Lambda streaming | SAA-C03: real-time protocols |
| REST endpoints | API Gateway REST | SAA-C03: API design |
| Health checks | ALB health checks | SAA-C03: load balancer config |
| Port configuration | Security Groups | SAA-C03: network security |

---

## 10. Cross-References

- [MCP Protocol Deep Dive](mcp-protocol-deep-dive.md) — Protocol spec, message format, capabilities
- [Architecture](../architecture-and-design/architecture.md) — System design overview
- [TypeScript for Python Devs](typescript-for-python-devs.md) — Language patterns used in the implementation
- [Testing](testing.md) — How transports are tested
