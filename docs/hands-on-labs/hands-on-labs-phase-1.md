# Hands-on Labs — Phase 1: MCP Fundamentals

> **Labs 1-4:** Build and test the MCP server
> **Time:** ~2 hours total

---

## Table of Contents

- [Cost Estimation — Local vs Cloud](#cost-estimation--local-vs-cloud)
- [Lab 1: First MCP Connection](#lab-1-first-mcp-connection)
- [Lab 2: Tool Execution](#lab-2-tool-execution)
- [Lab 3: Resource Access](#lab-3-resource-access)
- [Lab 4: Input Validation & Error Handling](#lab-4-input-validation--error-handling)

---

## Cost Estimation — Local vs Cloud

All labs run **locally for free**. Cloud costs if you deploy:

| Stack | Per lab session (~30 requests) | Monthly (always on) | Best for |
|-------|--------------------------------|---------------------|----------|
| **Local (Node.js)** | $0 | $0 | Learning, experimenting |
| **AWS (cheapest)** | ~$0 | ~$8/mo (Fargate 0.25 vCPU) | Proving cloud skills |
| **Azure (cheapest)** | ~$0 | ~$0 (Container Apps free tier) | Best free tier |

> **Note:** MCP server itself is lightweight (no LLM calls). Costs come from the hosting
> infrastructure only. The server exposes tools/resources — the LLM cost is on the client side.

---

## 🫏 The Donkey Analogy — Understanding Phase 1 MCP Fundamentals

| Metric | 🫏 Donkey Analogy | What It Means for MCP | How It's Calculated |
|--------|-------------------|------------------------|---------------------|
| **Tools Discovery** | Work stalls the donkey can visit | Available tool enumeration so AI clients know what actions exist | `GET /tools` → list tool schemas → verify count and names match expected |
| **Tool Execution** | Donkey visits a stall and completes the task | Invoking a tool with valid input and getting correct output | `POST /tools/{name}` with JSON body → check response status + result shape |
| **Resources** | Maps and catalogs the donkey reads before acting | Metadata and data sources the server exposes for context | `GET /resources` → list URIs → fetch content → verify non-empty response |
| **Input Validation** | Gatekeeper that blocks unsafe cargo | Schema enforcement rejects malformed or dangerous tool inputs | Send invalid JSON → verify 400/422 error with descriptive message |
| **Error Handling** | Donkey refuses a broken package instead of crashing | Graceful failure on bad inputs or missing tools | Send unknown tool name → verify structured error (not 500 crash) |
| **Health** | Station is reachable and open for business | Server process is up and accepting connections | `GET /health` → check status 200 + uptime/version metadata |

---

## Lab 1: First MCP Connection

> 🏢 **Business Context:** The AI team needs to verify the MCP server is reachable and responsive. This is the first integration test before connecting from Claude or the AI agent.

### Steps

```bash
cd repos/mcp-server && npm install && npm run build
npm run dev:sse
# In another terminal:
curl http://localhost:8300/health | jq
```

### Test

```bash
# Health check
curl -s http://localhost:8300/health | jq '.status'
# Expected: "healthy"

# List tools
curl -s http://localhost:8300/tools | jq '.count'
# Expected: 5

# List resources
curl -s http://localhost:8300/resources | jq '.resources | length'
# Expected: 3
```

### Verify

- [ ] Health check returns `"status": "healthy"`
- [ ] Tools endpoint lists exactly 5 tools
- [ ] Resources endpoint lists exactly 3 resources
- [ ] No errors in server logs

### 🧠 Certification Question

**Q: In AWS, which service provides the equivalent of MCP's "tools" concept?**
A: AWS Lambda functions. MCP tools are like Lambda functions — AI invokes them to perform actions. EventBridge routes tool calls (events) to Lambda, similar to how MCP routes tool calls.

### What you learned

The MCP server exposes a discoverable surface — health, tools, and resources — that any MCP client can enumerate. This is the foundation for tool-use AI.

**✅ Skill unlocked:** You can verify MCP connectivity and enumerate tools/resources.

---

## Lab 2: Tool Execution

> 🏢 **Business Context:** The analytics team needs database queries through the MCP server. Each tool call should be isolated, validated, and logged.

### Test Each Tool

```bash
# Echo tool
curl -X POST http://localhost:8300/tools/echo/call \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello MCP"}' | jq '.result'

# Database query
curl -X POST http://localhost:8300/tools/database_query/call \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT COUNT(*) as product_count FROM products"}' \
  | jq '.result | fromjson | .[0].product_count'

# Data analysis
curl -X POST http://localhost:8300/tools/data_analysis/call \
  -H "Content-Type: application/json" \
  -d '{"table": "products", "operation": "summary"}' \
  | jq '.result | fromjson | .table'

# HTTP API
curl -X POST http://localhost:8300/tools/http_api/call \
  -H "Content-Type: application/json" \
  -d '{"url": "https://httpbin.org/get", "method": "GET"}' \
  | jq '.result | fromjson | .status'

# Portfolio health
curl -X POST http://localhost:8300/tools/portfolio_health/call \
  -H "Content-Type: application/json" \
  -d '{"service": "all"}' \
  | jq '.result | fromjson'
```

### Verify

- [ ] Echo tool returns the message
- [ ] Database query returns product count as JSON
- [ ] Data analysis returns table summary
- [ ] HTTP API returns HTTP status 200
- [ ] Portfolio health shows service statuses

### 🧠 Certification Question

**Q: What AWS service would you use to apply rate limiting to MCP tool calls?**
A: API Gateway with throttling. Set rate limits to prevent abuse. In the MCP server, we could add middleware (like Nginx) with `limit_requests` in front of the SSE endpoint.

### What you learned

Each tool is isolated: different inputs, different outputs, different failure modes. Testing them individually proves the server contract before connecting any AI client.

**✅ Skill unlocked:** You can invoke every tool and interpret its JSON results.

---

## Lab 3: Resource Access

> 🏢 **Business Context:** The data platform team needs to understand available database schemas. Resources provide this metadata without executing queries.

### Test

```bash
# Read schema resource
curl -s http://localhost:8300/resources/database%3A%2F%2Fschema | jq '.content.tables[].name'
# Expected: products, orders

# Get column info
curl -s http://localhost:8300/resources/database%3A%2F%2Fschema | jq '.content.tables[0].columns[].name'
# Expected: id, name, category, price, stock

# Read capabilities
curl -s http://localhost:8300/resources/mcp%3A%2F%2Fcapabilities | jq '.content.tools'
# Expected: ["echo", "database_query", "data_analysis", "http_api", "portfolio_health"]

# Read portfolio services
curl -s http://localhost:8300/resources/portfolio%3A%2F%2Fservices | jq '.content.services[].name'
# Expected: RAG Chatbot, AI Gateway, AI Agent, MCP Server
```

### Verify

- [ ] Schema resource shows products and orders tables
- [ ] Schema lists all columns for each table
- [ ] Capabilities resource lists all 5 tools
- [ ] Portfolio services resource lists 4 services

### 🧠 Certification Question

**Q: Which AWS service provides schema metadata similar to MCP resources?**
A: AWS Glue Data Catalog — stores table definitions, column names, types. The AI uses this metadata to understand available data, just like MCP resources.

### What you learned

Resources provide metadata without executing queries. The AI reads the schema resource to understand what tables and columns exist before crafting a SQL query.

**✅ Skill unlocked:** You can access resources by URI and explain their role in AI-assisted data discovery.

---

## Lab 4: Input Validation & Error Handling

> 🏢 **Business Context:** The security team needs to verify that invalid inputs are rejected, SQL injection is prevented, and tool calls fail safely.

### Test Invalid Inputs

```bash
# Missing required field
curl -X POST http://localhost:8300/tools/database_query/call \
  -H "Content-Type: application/json" \
  -d '{}' | jq '.success'
# Expected: false

# Wrong type
curl -X POST http://localhost:8300/tools/database_query/call \
  -H "Content-Type: application/json" \
  -d '{"query": 123}' | jq '.error'
# Expected: error message

# Non-SELECT query (SQL injection prevention)
curl -X POST http://localhost:8300/tools/database_query/call \
  -H "Content-Type: application/json" \
  -d '{"query": "DROP TABLE products"}' | jq '.error'
# Expected: "Only SELECT queries allowed"

# Unknown tool
curl -X POST http://localhost:8300/tools/unknown_tool/call \
  -H "Content-Type: application/json" \
  -d '{}' | jq '.success'
# Expected: false

# Invalid resource URI
curl -s http://localhost:8300/resources/unknown%3A%2F%2Furi | jq '.error'
# Expected: error message
```

### Verify

- [ ] Missing required fields are rejected
- [ ] Wrong types are rejected
- [ ] SQL injection attempts are blocked
- [ ] Unknown tools return errors
- [ ] Invalid resources return 404

### 🧠 Certification Question

**Q: What AWS service enforces API request validation similar to our Zod schemas?**
A: API Gateway request validators — validate request structure, query parameters, path parameters before routing to Lambda. Our Zod schemas do the same: validate shape before execution.

### What you learned

Zod schemas reject bad input before execution. SQL injection is blocked at the query level (only SELECT allowed). Unknown tools and resources return clean errors. Defence in depth.

**✅ Skill unlocked:** You can test error paths and explain the server's input safety guarantees.

---

## Summary

| Lab | Component | Key Learning |
|-----|-----------|-------------|
| 1 | Connection | Server startup, health checks |
| 2 | Tools | Tool execution, database queries, external APIs |
| 3 | Resources | Metadata access, schema discovery |
| 4 | Validation | Error handling, SQL injection prevention |

## Phase 1 Labs — Skills Checklist

| # | Skill | Lab | Can you explain it? |
|---|---|---|---|
| 1 | MCP connectivity and endpoint sanity checks | Lab 1 | [ ] Yes |
| 2 | Tool invocation and result interpretation | Lab 2 | [ ] Yes |
| 3 | Resource URI-based metadata retrieval | Lab 3 | [ ] Yes |
| 4 | Input validation and safe failure behavior | Lab 4 | [ ] Yes |

**Next:** [Phase 2 Labs](hands-on-labs-phase-2.md) — Claude Desktop integration, streaming, Docker deployment
