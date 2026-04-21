# MCP Server — Copilot Instructions

This is a Model Context Protocol (MCP) server exposing tools and resources to AI clients (Claude Desktop, etc.) via stdio and HTTP transports.

## Architecture
- MCP-compliant server with tool and resource registries
- Multiple transports: stdio (for Claude Desktop), HTTP + SSE
- Provider-switchable storage backends (InMemory, PostgreSQL)
- Input validation via schemas

## Lab Runner
- `scripts/run_all_labs.py` — automated lab runner with crash resilience
- `scripts/start-resilient-server.sh` — auto-restart wrapper for the server
- Lab results go in `scripts/lab_results/`

## Key Patterns
- `api(client, method, path)` helper for all HTTP calls (with retry logic)
- Tool schemas for discovery and validation
- Health endpoint at `/health`
