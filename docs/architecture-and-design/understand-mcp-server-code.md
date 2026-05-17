# Understand MCP Server Code

> This document explains what the code **actually does** — with real inputs, real code paths, and real outputs.
> No abstract descriptions. Every section shows: input → code that runs → output.

---

## Table of Contents

- [Why This Repo Exists](#why-this-repo-exists)
- [How the Server Starts Up](#how-the-server-starts-up)
- [The 5 Tools — What Each One Actually Does](#the-5-tools--what-each-one-actually-does)
- [How Zod Validation Works — The Exact Rejection Mechanism](#how-zod-validation-works--the-exact-rejection-mechanism)
- [The SQL Safety Check — The 3 Lines That Block Non-SELECT Queries](#the-sql-safety-check--the-3-lines-that-block-non-select-queries)
- [SSE Transport — Step by Step for One Tool Call](#sse-transport--step-by-step-for-one-tool-call)
- [Stdio Transport — How Claude Desktop Uses This Server](#stdio-transport--how-claude-desktop-uses-this-server)
- [The 3 Resources — What Each URI Returns](#the-3-resources--what-each-uri-returns)
- [SSE Streaming — What the Event Stream Actually Looks Like](#sse-streaming--what-the-event-stream-actually-looks-like)
- [How data_analysis Builds SQL Internally](#how-data_analysis-builds-sql-internally)
- [What an AI Engineer Actually Does with MCP](#what-an-ai-engineer-actually-does-with-mcp)
- [Current State: Done vs Not Done](#current-state-done-vs-not-done)
- [Study Order](#study-order)
- [Interview Answers — With Real Examples, Not Slogans](#interview-answers--with-real-examples-not-slogans)
- [Study Checklist](#study-checklist)

---


---

## Why This Repo Exists

`ai-agent` teaches one thing: how a LangGraph agent decides to call a tool.
`mcp-server` teaches the other side: how you **publish** tools and data in a typed, discoverable contract so *any* client — Claude Desktop, your agent, a test script — can call them the same way.

**DE parallel:** `ai-agent` is the Airflow DAG deciding which task to run. `mcp-server` is the internal data platform exposing the datasets that task needs. The DAG does not care how the data is stored; it just calls the platform's API. Same pattern here.

---

## How the Server Starts Up

**Entry point:** `src/index.ts`

The server reads all config from environment variables. Here is the full list of what matters at startup:

```bash
MCP_TRANSPORT=sse          # or stdio — this single variable decides everything below
MCP_PORT=8300
POSTGRES_HOST=localhost
POSTGRES_DB=mcp_data
POSTGRES_USER=mcp_user
POSTGRES_PASSWORD=mcp_pass
```

`loadConfig()` in `src/config.ts` parses these with Zod. This is the TypeScript equivalent of Python's `Pydantic Settings`. Every field has a `.default(...)`, so if an env var is missing the server still starts with safe defaults (port 8300, transport sse, db on localhost).

**After config is loaded**, the startup code does this (from `src/index.ts`, lines 24–50):

```
Step 1: const config = loadConfig()
        → if MCP_TRANSPORT is not "stdio" or "sse", Zod throws here. Server stops.

Step 2: const database = createDatabaseProvider(config, logger)
        await database.connect()
        → connects to PostgreSQL at POSTGRES_HOST:POSTGRES_PORT

Step 3: if (config.transport === "stdio")
           → creates MCP SDK Server + StdioServerTransport
           → registers tool handlers on the Server object
           → calls server.connect(transport) — now listening on stdin
        else
           → creates ToolRegistry (5 tools) + ResourceProvider (3 resources)
           → creates Express app with /tools, /resources, /stream routes
           → starts listening on config.port (default 8300)
```

**The critical decision:** `config.transport === "stdio"` vs. everything else. This is not two different codebases — it is the same `ToolRegistry` and `ResourceProvider` served through two different interfaces. One uses JSON-RPC over stdin/stdout. The other uses HTTP.

---

## The 5 Tools — What Each One Actually Does

All 5 tools are registered in `ToolRegistry.registerDefaultTools()` in `src/tools/registry.ts`. When you call `GET /tools`, you get back all 5 descriptions including their Zod-derived JSON schemas. When you call `POST /tools/:name/call`, the switch statement in `executeTool()` routes to the right private method.

---

### Tool 1: `echo`

The simplest tool. Its only job is to prove the server is alive.

**Input schema** (from `src/types.ts`):
```typescript
export const EchoInputSchema = z.object({
  message: z.string().describe("The message to echo back"),
});
```

**You send:**
```http
POST /tools/echo/call
Content-Type: application/json

{ "message": "hello from Ketan" }
```

**Code that runs** (`executEcho` in `registry.ts`):
```typescript
const parsed = EchoInputSchema.parse(input);
return `Echo: ${parsed.message}`;
```

**You get back:**
```json
{ "success": true, "result": "Echo: hello from Ketan" }
```

**What breaks it:** Send `{ "message": 42 }` — Zod rejects it because `42` is not a string:
```json
{ "success": false, "error": "ZodError: Expected string, received number at path: message" }
```

---

### Tool 2: `database_query`

Runs a SQL SELECT query against PostgreSQL. Two safety layers: Zod validates the shape, then a manual check blocks non-SELECT queries.

**Input schema** (from `src/types.ts`):
```typescript
export const DatabaseQueryInputSchema = z.object({
  query: z.string().describe("SQL SELECT query to execute"),
  params: z.array(z.union([z.string(), z.number()])).optional(),
});
```

**You send:**
```http
POST /tools/database_query/call
Content-Type: application/json

{
  "query": "SELECT name, price FROM products WHERE price > $1",
  "params": [50]
}
```

**Code that runs** (`executeQuery` in `registry.ts`):
```typescript
const parsed = DatabaseQueryInputSchema.parse(input);

// Safety check
if (!parsed.query.trim().toUpperCase().startsWith("SELECT")) {
  throw new Error("Only SELECT queries are allowed");
}

const results = await this.database.query(parsed.query, parsed.params);
return JSON.stringify(results, null, 2);
```

**You get back:**
```json
{
  "success": true,
  "result": "[\n  { \"name\": \"Laptop\", \"price\": 999.99 },\n  { \"name\": \"Monitor\", \"price\": 349.00 }\n]"
}
```

Note: `result` is a JSON string, not a JSON object. The MCP protocol returns tool outputs as text. The client parses it if needed.

---

### Tool 3: `data_analysis`

Builds SQL queries internally based on the operation type. The client does not write SQL — it says what analysis it wants.

**Input schema:**
```typescript
export const DataAnalysisInputSchema = z.object({
  table: z.string(),
  operation: z.enum(["summary", "top_n", "distribution", "correlations"]),
  column: z.string().optional(),
  limit: z.coerce.number().default(10),
});
```

**You send:**
```http
POST /tools/data_analysis/call
Content-Type: application/json

{ "table": "products", "operation": "top_n", "column": "price", "limit": 3 }
```

**Code that runs** (the `top_n` case in `executeAnalysis`):
```typescript
const col = parsed.column || schema.columns[0].name;
const query = `SELECT * FROM "${parsed.table}" ORDER BY "${col}" DESC LIMIT $1`;
const results = await this.database.query(query, [parsed.limit]);
return JSON.stringify(results, null, 2);
```

So `{ table: "products", operation: "top_n", column: "price", limit: 3 }` becomes internally:
```sql
SELECT * FROM "products" ORDER BY "price" DESC LIMIT 3
```

**You get back** the top 3 rows by price as a JSON string.

---

### Tool 4: `http_api`

Makes an HTTP request to any URL. Includes a timeout so a slow external service does not hang the server.

**Input schema:**
```typescript
export const HttpApiInputSchema = z.object({
  url: z.string().url(),  // Zod validates this is a real URL format
  method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("GET"),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  timeout: z.coerce.number().default(10000),  // milliseconds
});
```

**You send:**
```http
POST /tools/http_api/call
Content-Type: application/json

{ "url": "http://localhost:8200/health", "method": "GET" }
```

**What runs internally:** `fetch(url, { signal: AbortSignal.timeout(10000) })`. If the URL is unreachable or times out, `AbortController.abort()` fires and you get a clean error response instead of the server hanging.

**What breaks it:** `{ "url": "not-a-url" }` — Zod's `.url()` validator rejects this before any network call.

---

### Tool 5: `portfolio_health`

Checks if the other portfolio services are alive. It knows the fixed port for each service.

**Internal port map** (hardcoded in `executePortfolioHealth`):
```typescript
const port = { gateway: 8100, agent: 8200, chatbot: 8000 }[service];
```

**You send:**
```http
POST /tools/portfolio_health/call
Content-Type: application/json

{ "service": "all" }
```

**Code that runs:** loops over `["gateway", "agent", "chatbot"]`, does `fetch("http://localhost:{port}/health", { signal: AbortSignal.timeout(5000) })` for each, records "healthy", "unhealthy", or "unreachable".

**You get back:**
```json
{
  "success": true,
  "result": "{\n  \"gateway\": \"healthy\",\n  \"agent\": \"healthy\",\n  \"chatbot\": \"unreachable\"\n}"
}
```

"unreachable" means the `fetch` threw (connection refused or timeout). "unhealthy" means the server replied but `response.ok` was false (e.g. 500 status).

---

## How Zod Validation Works — The Exact Rejection Mechanism

Every tool input goes through `.parse(input)` before any business logic runs. Here is the exact mechanism using `database_query` as the example.

**The schema** (from `src/types.ts`):
```typescript
export const DatabaseQueryInputSchema = z.object({
  query: z.string().describe("SQL SELECT query to execute"),
  params: z.array(z.union([z.string(), z.number()])).optional(),
});
```

**Scenario A — valid input:**
```json
{ "query": "SELECT * FROM products", "params": [50, "electronics"] }
```
`DatabaseQueryInputSchema.parse(...)` returns `{ query: "SELECT * FROM products", params: [50, "electronics"] }`. Execution continues.

**Scenario B — wrong type:**
```json
{ "query": 12345 }
```
Zod throws before `executeQuery` runs one line:
```
ZodError: [
  { "code": "invalid_type", "expected": "string", "received": "number", "path": ["query"],
    "message": "Expected string, received number" }
]
```
The `catch` in `POST /tools/:name/call` (in `sse.ts`) catches this and returns:
```json
{ "success": false, "error": "Expected string, received number" }
```

**Scenario C — missing required field:**
```json
{ "params": [50] }
```
Zod throws: `"Required" at path: query`.

**DE parallel:** This is exactly what happens when you validate a Glue job's input parameters with a Pydantic model before the job starts processing records. Bad shape → reject early, never touch the data store.

---

## The SQL Safety Check — The 3 Lines That Block Non-SELECT Queries

After Zod validates that `query` is a string, there is a second check. This is in `executeQuery` in `src/tools/registry.ts`:

```typescript
if (!parsed.query.trim().toUpperCase().startsWith("SELECT")) {
  throw new Error("Only SELECT queries are allowed");
}
```

**What this means concretely:**

| Input query | `.trim().toUpperCase().startsWith("SELECT")` | Result |
| --- | --- | --- |
| `SELECT * FROM products` | `true` | passes, runs DB query |
| `  select name from products` | `true` (after trim + upper) | passes |
| `DELETE FROM products WHERE id = 1` | `false` | throws "Only SELECT queries are allowed" |
| `DROP TABLE products` | `false` | throws |
| `; DROP TABLE products` | `false` (starts with `;`) | throws |
| `UPDATE products SET price = 0` | `false` | throws |

**What this does NOT catch:** `SELECT * FROM products; DELETE FROM products`. The string starts with SELECT so it passes. The real protection against SQL injection is in parameterized queries — using `params: [50]` instead of embedding values directly in the string. The SELECT-only check is the governance guard; parameterized queries are the injection guard.

---

## SSE Transport — Step by Step for One Tool Call

When `MCP_TRANSPORT=sse`, Express handles HTTP requests. Here is exactly what happens when you call `POST /tools/database_query/call`.

**Step 1 — The HTTP request arrives at Express**

Route in `src/server/sse.ts`:
```typescript
app.post("/tools/:name/call", express.json(), async (req, res) => {
  const { name } = req.params;    // "database_query"
  const input = req.body;         // { query: "SELECT ...", params: [50] }
  ...
```

**Step 2 — Express passes name and body to ToolRegistry**

```typescript
  const result = await toolRegistry.executeTool(name, input);
```

**Step 3 — ToolRegistry switch routes to the right handler**

```typescript
async executeTool(name, input) {
  switch (name) {
    case "database_query":
      return await this.executeQuery(input);   // <-- this runs
    ...
  }
}
```

**Step 4 — executeQuery runs: Zod parse → SELECT check → DB query**

```typescript
const parsed = DatabaseQueryInputSchema.parse(input);
if (!parsed.query.trim().toUpperCase().startsWith("SELECT")) throw ...;
const results = await this.database.query(parsed.query, parsed.params);
return JSON.stringify(results, null, 2);
```

**Step 5 — Express sends the response**

Success path:
```typescript
res.json({ success: true, result });
// result is the JSON string from step 4
```

Error path (bad input or non-SELECT):
```typescript
res.status(400).json({
  success: false,
  error: error instanceof Error ? error.message : "Unknown error",
});
```

**Full round-trip:**
```
Client sends HTTP POST
  ↓
Express receives at /tools/database_query/call (sse.ts line ~50)
  ↓
toolRegistry.executeTool("database_query", { query: "SELECT ...", params: [50] })
  ↓
DatabaseQueryInputSchema.parse(input)  → passes
  ↓
startsWith("SELECT") check             → passes
  ↓
this.database.query("SELECT ...", [50]) → hits PostgreSQL
  ↓
JSON.stringify(rows)                   → "[\n  { \"name\": \"Laptop\" ... }\n]"
  ↓
res.json({ success: true, result: "..." })
  ↓
Client receives { success: true, result: "..." }
```

---

## Stdio Transport — How Claude Desktop Uses This Server

When `MCP_TRANSPORT=stdio`, the server uses the MCP SDK's `StdioServerTransport` instead of Express. The transport reads from `process.stdin` and writes to `process.stdout`. Claude Desktop launches the server as a subprocess and talks to it over pipes.

**What the JSON-RPC message looks like on stdin** (Claude Desktop sends this):
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "database_query",
    "arguments": { "query": "SELECT * FROM products", "params": [] }
  }
}
```

**The handler registered in `src/server/mcp.ts`:**
```typescript
server.setRequestHandler("tools/call", async (request) => {
  const { name, arguments: args } = request.params;
  const result = await registry.executeTool(name, args);

  return {
    content: [{ type: "text", text: result }],
  };
});
```

**What goes back on stdout:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{ "type": "text", "text": "[\n  { \"name\": \"Laptop\" ... }\n]" }]
  }
}
```

**Key difference from SSE:** In SSE the result is `{ success: true, result: "..." }`. In stdio the result is wrapped in `{ content: [{ type: "text", text: "..." }] }` — the MCP SDK's standard tool-call response format. The business logic (`executeQuery`) is identical in both paths.

The tool list request also works the same way:
```json
{ "method": "tools/list", "params": {} }
→ returns { "tools": [{ "name": "echo", ... }, { "name": "database_query", ... }, ...] }
```

---

## The 3 Resources — What Each URI Returns

Resources are read-only. No DB writes happen. You ask for a URI and get back JSON.

**How to call them over SSE:**
```http
GET /resources/database%3A%2F%2Fschema
```
(URL-encoded because `://` in a path segment needs encoding)

**URI 1: `database://schema`**

Returns the table structure. This is static — `ResourceProvider` hardcodes the schema, it does not introspect live DB tables. From `src/resources/provider.ts`:

```json
{
  "tables": [
    {
      "name": "products",
      "description": "Product catalog",
      "columns": [
        { "name": "id",       "type": "integer" },
        { "name": "name",     "type": "text" },
        { "name": "category", "type": "text" },
        { "name": "price",    "type": "numeric" },
        { "name": "stock",    "type": "integer" }
      ]
    },
    {
      "name": "orders",
      "description": "Customer orders",
      "columns": [ "..." ]
    }
  ]
}
```

An AI agent reads this before deciding which SQL query to write. Without it, the agent would have to call `database_query` with `SELECT table_name FROM information_schema.tables` first — a round trip. The resource saves that round trip.

**URI 2: `mcp://capabilities`**

Returns what this server can do. Equivalent to calling `GET /tools` plus `GET /resources` in one call:
```json
{
  "tools": ["echo", "database_query", "data_analysis", "http_api", "portfolio_health"],
  "resources": ["database://schema", "mcp://capabilities", "portfolio://services"]
}
```

**URI 3: `portfolio://services`**

Returns the other services in the portfolio and their ports:
```json
{
  "services": [
    { "name": "ai-gateway",  "port": 8100, "description": "LLM proxy and router" },
    { "name": "ai-agent",    "port": 8200, "description": "LangGraph agent with tools" },
    { "name": "rag-chatbot", "port": 8000, "description": "RAG pipeline chatbot" }
  ]
}
```

**Why resources are a separate concept from tools:** A tool changes state (runs a query, calls an API). A resource is safe to cache and pre-fetch. The MCP protocol allows clients to subscribe to resource changes. Tools do not have that subscription mechanism.

---

## SSE Streaming — What the Event Stream Actually Looks Like

`GET /stream/tools/:name` returns a Server-Sent Events stream instead of a single JSON response. This is in `src/server/sse.ts`.

**You send:**
```bash
curl -N "http://localhost:8300/stream/tools/echo?message=hello"
```

**The response headers:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**The exact event lines you receive in order:**

```
data: {"event":"connected","tool":"echo"}

data: {"event":"executing","tool":"echo"}

data: {"event":"success","result":"Echo: hello"}
```

Connection closes after the `success` event.

**If the tool fails** (e.g. bad Zod input):
```
data: {"event":"connected","tool":"database_query"}

data: {"event":"executing","tool":"database_query"}

data: {"event":"error","error":"Only SELECT queries are allowed"}
```

**Why this exists:** Long-running tools (like `data_analysis` on a large table or `http_api` to a slow endpoint) can stream progress events while the client waits. The non-streaming `POST /tools/:name/call` would just block until it finishes. The streaming version lets the UI show "executing..." live.

---

## How data_analysis Builds SQL Internally

The four operations map to four different SQL patterns. None of this SQL is visible to the caller — the caller just picks `operation`.

| `operation` | Internal SQL built | What it answers |
| --- | --- | --- |
| `summary` | Does NOT run SQL — returns schema.columns + schema.rowCount from in-memory schema | "How many rows, what columns?" |
| `top_n` | `SELECT * FROM "{table}" ORDER BY "{column}" DESC LIMIT $1` | "What are the top N rows by this column?" |
| `distribution` | `SELECT "{column}", COUNT(*) as count FROM "{table}" GROUP BY "{column}" ORDER BY count DESC LIMIT 10` | "What values appear most often in this column?" |
| `correlations` | Falls through to `default:` — returns the raw schema JSON | Not fully implemented yet |

**Concrete example — `top_n`:**

Input: `{ "table": "products", "operation": "top_n", "column": "price", "limit": 3 }`
SQL built: `SELECT * FROM "products" ORDER BY "price" DESC LIMIT 3`
Output rows: the 3 most expensive products.

**Concrete example — `distribution`:**

Input: `{ "table": "products", "operation": "distribution", "column": "category" }`
SQL built:
```sql
SELECT "category", COUNT(*) as count
FROM "products"
GROUP BY "category"
ORDER BY count DESC
LIMIT 10
```
Output: which product categories appear most, sorted by frequency.

**What happens if you pass a table that does not exist:**
```typescript
const schema = schemas.find((s) => s.tableName === parsed.table);
if (!schema) {
  throw new Error(`Table '${parsed.table}' not found`);
}
```
The tool checks the known schema list first. If `parsed.table` is not in it, it throws before running any SQL.

---

## What an AI Engineer Actually Does with MCP

Here is the practical job list with what this repo already delivers.

| Job | Does this repo do it? | Where exactly |
| --- | --- | --- |
| Publish tools with typed schemas | Yes | `src/types.ts` defines Zod schemas; `registerDefaultTools()` in `registry.ts` registers them; `tools/list` handler serves them to clients |
| Validate every tool call before running it | Yes | Each handler calls `Schema.parse(input)` as its first line — bad input never reaches DB or network |
| Block dangerous SQL operations | Yes | `startsWith("SELECT")` check in `executeQuery` — any non-SELECT throws before the DB driver runs it |
| Protect external calls from hanging the server | Yes | `AbortController` + `setTimeout(controller.abort, timeout)` in `executeHttpApi` |
| Serve two client types with one codebase | Yes | Same `ToolRegistry` and `ResourceProvider` used by both `mcp.ts` (stdio) and `sse.ts` (HTTP) |
| Let clients discover available tools | Yes | `GET /tools` over SSE; `tools/list` handler over stdio — returns all 5 tool descriptions including Zod-derived JSON schema |
| Let clients read metadata without calling tools | Yes | `GET /resources` + `GET /resources/:uri` over SSE; `resources/list` + `resources/read` over stdio |
| Stream tool progress to waiting clients | Yes | `GET /stream/tools/:name` sends connected → executing → success/error SSE events |
| Health check for ops | Yes | `GET /health` returns `{ status: "healthy", tools: 5, transport: "sse" }` |
| Auth and rate limiting per route | Partial | Config loads `apiKey` and `rateLimitRpm`; Express routes do NOT yet check them per request |
| Full ai-agent → MCP end-to-end | Partial | ai-agent has MCP client scaffold; full runtime consumption of these tools is a follow-up |

---

## Current State: Done vs Not Done

| Area | Status | Concrete evidence |
| --- | --- | --- |
| All 5 tools registered and callable | Done | `registerDefaultTools()` in `registry.ts` — confirmed via `GET /tools` |
| Zod validation on every tool input | Done | `Schema.parse(input)` is line 1 of every private execute method |
| SELECT-only SQL enforcement | Done | `startsWith("SELECT")` check in `executeQuery` |
| Timeout on external HTTP calls | Done | `AbortController` in `executeHttpApi` |
| 3 resources discoverable and readable | Done | `getAvailableResources()` + `readResource()` in `resources/provider.ts` |
| SSE transport (HTTP) | Done | Express app with `/tools`, `/resources`, `/stream`, `/health` in `sse.ts` |
| Stdio transport (MCP SDK) | Done | `StdioServerTransport` + `Server.connect()` in `mcp.ts` |
| `api-key` enforced per request | Not done | `config.apiKey` exists but no `req.headers["x-api-key"]` check in route handlers |
| Rate limiting per request | Not done | `config.rateLimitRpm` exists but no middleware counting requests |
| ai-agent consuming these tools at runtime | Not done | ai-agent has MCP config; wiring is not complete |

---

## Study Order

Read these files in this order. Each one builds on the previous.

| Step | File | What to understand when reading it |
| --- | --- | --- |
| 1 | `src/config.ts` | How Zod validates config at startup. Look at the `.default(...)` values — these are your fallbacks. |
| 2 | `src/index.ts` | The single if/else that splits stdio vs SSE. Understand that ToolRegistry and ResourceProvider are created in both paths. |
| 3 | `src/types.ts` | Every Zod schema for every tool input. Read the `.describe(...)` strings — those show up in the tools/list response that AI clients read. |
| 4 | `src/tools/registry.ts` | The switch statement in `executeTool`. Then read each private method. Notice that every one starts with `Schema.parse(input)`. |
| 5 | `src/resources/provider.ts` | The switch statement in `readResource`. Notice the URIs are custom strings (`database://schema`), not HTTP URLs. |
| 6 | `src/server/sse.ts` | How Express routes map to ToolRegistry and ResourceProvider methods. Pay attention to the streaming route. |
| 7 | `src/server/mcp.ts` | How the MCP SDK Server gets the same ToolRegistry via `registerTools`. Compare the response format with sse.ts — they differ. |
| 8 | `tests/*.test.ts` | What the tests mock vs what they actually exercise. |

---

## Interview Answers — With Real Examples, Not Slogans

### Q: Why did you build an MCP server?

**Bad answer:** "To standardize tool access for AI clients."

**Good answer with evidence:** "I built it so any AI client — Claude Desktop over stdio, a test script over HTTP — can discover and call the same 5 tools using the same typed contract. The tool schemas come from Zod. When you hit `GET /tools` you get the full JSON schema for each tool's input, so the client knows exactly what to send. No shared code between the server and the client — just the protocol."

### Q: What is the difference between a tool and a resource?

**Bad answer:** "Tools do actions, resources are read-only."

**Good answer with evidence:** "A tool call always runs code — a DB query, an HTTP request. I can call `database_query` 10 times and get 10 different results depending on data. A resource is a stable snapshot. `database://schema` returns the same table structure every time — it does not hit the live DB. An AI agent uses the resource to understand what tables exist, then uses the tool to actually query them."

### Q: How does Zod protect the server?

**Bad answer:** "It validates inputs before execution."

**Good answer with evidence:** "Every execute method's first line is `Schema.parse(input)`. If the client sends `{ query: 12345 }` instead of a string, Zod throws before the DB driver is ever called. The Express catch block converts that Zod error to a 400 with the exact field path that failed. The DB never sees bad input."

### Q: What would happen if you removed the SELECT-only check?

"The server would execute any SQL the client sends — INSERT, DELETE, DROP TABLE. The Zod schema only guarantees `query` is a string. It says nothing about SQL semantics. The SELECT check is a separate governance guard on top of type safety."

### Q: Why two transports?

"Claude Desktop only supports stdio — it launches MCP servers as child processes and communicates over pipes. Web UIs and test scripts use HTTP. By keeping `ToolRegistry` and `ResourceProvider` as plain classes with no transport coupling, I wire them to both transports from `index.ts`. The tool logic has zero knowledge of how the request arrived."

---

## Study Checklist

- [ ] I can trace `POST /tools/database_query/call` from Express route to DB query to response, naming the code line at each step.
- [ ] I can explain what `DatabaseQueryInputSchema.parse(input)` does when `query` is a number instead of a string.
- [ ] I can write the SQL that `data_analysis` with `operation: "top_n"` builds internally.
- [ ] I can explain the difference in response format between the SSE path (`{ success, result }`) and the stdio path (`{ content: [{ type: "text", text }] }`).
- [ ] I can explain what the 3 resource URIs return and when an AI agent would read each one.
- [ ] I can explain why removing `startsWith("SELECT")` is dangerous even though Zod already validates the input.
- [ ] I can name what auth/rate-limiting config exists but is NOT enforced at the route level yet.
