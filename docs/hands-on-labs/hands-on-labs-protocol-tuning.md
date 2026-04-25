# Hands-on Labs — Protocol Tuning (Tier 1–5)

> **Why these labs exist:** This is the AI-engineering interview answer. When asked "how would you tune this MCP server?" the answer is a guided tour of these sweeps + their trade-offs.
>
> **How to run:** Each lab changes ONE config in `.env` (or one bit of server code), runs the same 3 protocol calls, records the metrics, and explains the trade-off.
>
> **🫏 Donkey lens:** Each lab ends with a donkey takeaway summarising the trade-off in plain language.

## Table of Contents
- [Setup — Common to all labs](#setup--common-to-all-labs)
- [Lab 1: Tool Schema Validation Strictness](#lab-1-tool-schema-validation-strictness)
- [Lab 2: Error-Handling Mode](#lab-2-error-handling-mode)
- [Lab 3: Transport Sweep (stdio vs SSE vs HTTP)](#lab-3-transport-sweep-stdio-vs-sse-vs-http)
- [Lab 4: Input Validation Aggressiveness](#lab-4-input-validation-aggressiveness)
- [Lab 5: Resource-vs-Tool Decision](#lab-5-resource-vs-tool-decision)
- [Lab 6: Prompt Template Variants](#lab-6-prompt-template-variants)

---

## Setup — Common to all labs

1. Make sure the MCP server is running: `npm run dev` (transport from `MCP_TRANSPORT`)
2. Make sure Postgres is up for database tools: `docker compose up -d postgres`
3. Have a connected MCP client ready (e.g., Claude Desktop, the ai-agent repo's MCP client, or `npx @modelcontextprotocol/inspector`)
4. Have the 3 fixed test calls ready:
   - **C1:** `tools/list` then call `db.query` with `{ "sql": "SELECT count(*) FROM users" }`
   - **C2:** Call `db.query` with deliberately bad input `{ "sql": 12345 }` (wrong type)
   - **C3:** Read resource `portfolio://summary` (or call equivalent tool) and capture the response shape
5. Each lab takes ~5–10 min: change config → restart server → re-run calls → record table

---

## Lab 1: Tool Schema Validation Strictness — "How rigid is the tool's manifest?"

**Config:** `MCP_SCHEMA_STRICT_MODE` (default: `true`; controls Zod `.strict()` vs `.passthrough()` on tool input schemas)
**What it controls:** Whether unexpected keys in tool arguments are rejected or silently ignored.
**Hypothesis:** Strict = clients fail loudly on typos and learn fast; lax = bad inputs slip through and corrupt downstream tool behaviour.

### Setup
1. Set `MCP_SCHEMA_STRICT_MODE=true` in `.env`
2. Run C1; then call `db.query` with an extra unknown key `{ "sql": "SELECT 1", "limitt": 5 }`
3. Run C2 and C3
4. Repeat for each value below

### Results table (fill in as you run)
| Value | Validation errors caught | Faithfulness of error msg | Latency (ms) | Cost (€) | Notes |
|---|---|---|---|---|---|
| strict (.strict()) | ___ | ___ | ___ | ___ | ___ |
| default (.object()) | ___ | ___ | ___ | ___ | ___ |
| lax (.passthrough()) | ___ | ___ | ___ | ___ | ___ |

### What we learned
Strict schemas are MCP best practice — clients (especially LLM agents) misspell keys constantly and silent acceptance turns into silent data bugs. Pay the upfront friction.

### 🫏 Donkey takeaway
A strict tool manifest tells the donkey "no, that's not on the wagon" the moment it grabs the wrong tool; a lax manifest lets it hammer with a screwdriver.

---

## Lab 2: Error-Handling Mode — "How does the stable react when a delivery fails?"

**Config:** `MCP_ERROR_MODE` (default: `structured`; values: `structured` / `verbose` / `silent`)
**What it controls:** Whether tool errors return structured JSON-RPC errors with codes, raw stack traces, or a generic "something went wrong".
**Hypothesis:** Structured errors with stable error codes give clients a chance to recover; verbose leaks internals; silent makes debugging hell.

### Setup
1. Set `MCP_ERROR_MODE=structured` in `.env`
2. Run C2 (bad-input call) and capture the error response
3. Force a deliberate runtime error (kill Postgres mid-call) and re-run C1
4. Repeat for each mode below

### Results table (fill in as you run)
| Value | Client recovery rate | Info leakage risk | Latency (ms) | Cost (€) | Notes |
|---|---|---|---|---|---|
| structured (code+message) | ___ | ___ | ___ | ___ | ___ |
| verbose (full stack) | ___ | ___ | ___ | ___ | ___ |
| silent (generic 500) | ___ | ___ | ___ | ___ | ___ |

### What we learned
Structured wins for production: stable error codes (`-32602` invalid params, custom `1001` db unavailable) let agents retry, switch tools, or surface a clean message. Verbose is fine for local dev only.

### 🫏 Donkey takeaway
A structured "delivery failed because the warehouse was closed" lets the donkey come back tomorrow; "everything broke" leaves the donkey staring at the door.

---

## Lab 3: Transport Sweep (stdio vs SSE vs HTTP) — "Which road into the stable?"

**Config:** `MCP_TRANSPORT` (default: `sse`; values: `stdio` / `sse` / `http`)
**What it controls:** Wire transport between client and MCP server.
**Hypothesis:** stdio = lowest latency, single-process; SSE = browser/HTTP-friendly + streaming; HTTP request/response = simplest, no streaming.

### Setup
1. Set `MCP_TRANSPORT=stdio` and start the server as a child process from a stdio client
2. Run C1, C2, C3 and record latency
3. Repeat for `sse` (port 8300, EventSource client) and `http`

### Results table (fill in as you run)
| Value | Streaming support | Multi-client | Latency p50 (ms) | Setup complexity | Notes |
|---|---|---|---|---|---|
| stdio | ___ | ___ | ___ | ___ | ___ |
| sse | ___ | ___ | ___ | ___ | ___ |
| http | ___ | ___ | ___ | ___ | ___ |

### What we learned
stdio is best when the client owns the server lifecycle (Claude Desktop, IDEs); SSE is best for browsers and remote agents needing streaming; plain HTTP is fine for stateless integrations. Pick per deployment, not per project.

### 🫏 Donkey takeaway
stdio = the donkey lives in the client's barn; SSE = a phone line that keeps ringing as new parcels arrive; HTTP = one knock per delivery.

---

## Lab 4: Input Validation Aggressiveness — "Frisk the parcel at the door?"

**Config:** `MCP_INPUT_VALIDATION_LEVEL` (default: `normal`; values: `minimal` / `normal` / `paranoid`)
**What it controls:** How hard the server validates inputs beyond schema — SQL injection guards, length caps, type coercion, allow-list for table names, etc.
**Hypothesis:** Paranoid = safest but rejects legitimate-but-unusual inputs; minimal = fast but exposes the database/file system.

### Setup
1. Set `MCP_INPUT_VALIDATION_LEVEL=minimal`
2. Run C1; then try `db.query` with `"DROP TABLE users; --"` and a 100KB SQL string
3. Repeat for each level below

### Results table (fill in as you run)
| Value | Malicious calls blocked | Legitimate calls rejected | Latency (ms) | Cost (€) | Notes |
|---|---|---|---|---|---|
| minimal (schema only) | ___ | ___ | ___ | ___ | ___ |
| normal (length + allowlist) | ___ | ___ | ___ | ___ | ___ |
| paranoid (parameterised + audit) | ___ | ___ | ___ | ___ | ___ |

### What we learned
For DB tools, paranoid is the only acceptable level in prod — never accept raw SQL from an LLM; always parameterise and allowlist tables. The cost is friction for power users.

### 🫏 Donkey takeaway
A minimal door waves every parcel through; a paranoid door X-rays each one — slower, but the donkey doesn't carry a bomb into the warehouse.

---

## Lab 5: Resource-vs-Tool Decision — "Should this be a parcel on a shelf or a delivery on demand?"

**Config:** code-level decision: expose data as MCP `resource` (URI-addressed, cacheable, idempotent) vs `tool` (call-based, side-effects allowed). No env var — this lab modifies `src/server.ts` to expose the same data both ways.
**What it controls:** Whether clients fetch via `resources/read portfolio://summary` (resource) or `tools/call get_portfolio_summary` (tool).
**Hypothesis:** Resources cache and discover better; tools are needed for parameterised or stateful operations.

### Setup
1. Expose a "portfolio summary" both as a resource (`portfolio://summary`) and as a tool (`get_portfolio_summary`)
2. Run C3 via resource; then via tool
3. Try a parameterised case ("summary for repo=ai-gateway") via each — note which feels natural

### Results table (fill in as you run)
| Value | Discoverability | Cacheability | Latency (ms) | Cost (€) | Notes |
|---|---|---|---|---|---|
| as resource | ___ | ___ | ___ | ___ | ___ |
| as tool | ___ | ___ | ___ | ___ | ___ |
| parameterised → tool only | ___ | ___ | ___ | ___ | ___ |

### What we learned
Read-only, parameter-free, cacheable = resource. Anything with side effects, parameters, or per-call computation = tool. Mis-modeling here is the #1 reason MCP integrations feel awkward.

### 🫏 Donkey takeaway
A resource is a parcel sitting on a labelled shelf — anyone can grab it; a tool is a delivery the donkey runs each time, sometimes carrying changes back.

---

## Lab 6: Prompt Template Variants — "Which delivery note does the stable hand the agent?"

**Config:** MCP `prompts/*` templates (default: `assistant_default`; alternates: `assistant_strict`, `assistant_concise`, `assistant_donkey`)
**What it controls:** The reusable prompt templates the server exposes via `prompts/list` and `prompts/get`. Clients render them into the LLM context.
**Hypothesis:** Strict / concise templates produce shorter, more faithful tool-use; verbose templates burn tokens with no quality gain.

### Setup
1. Add at least 3 prompt templates to `src/prompts.ts` (default, strict, donkey)
2. From the client, fetch each via `prompts/get` and run C1 + C3
3. Compare answers for length, faithfulness, and tool-call accuracy

### Results table (fill in as you run)
| Value | Tool-call accuracy | Faithfulness | Latency (ms) | Token cost (€) | Notes |
|---|---|---|---|---|---|
| assistant_default | ___ | ___ | ___ | ___ | ___ |
| assistant_strict | ___ | ___ | ___ | ___ | ___ |
| assistant_concise | ___ | ___ | ___ | ___ | ___ |
| assistant_donkey 🫏 | ___ | ___ | ___ | ___ | ___ |

### What we learned
MCP `prompts/*` is an underused superpower — server-side templates let you ship best-practice instructions to every connected agent without each client reinventing them.

### 🫏 Donkey takeaway
The stable manager hands the donkey a delivery note before each trip; the right template makes every trip cleaner without retraining the donkey.
