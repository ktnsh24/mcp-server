#!/usr/bin/env python3
"""
Run all hands-on labs for the MCP Server project.

Usage:
    python scripts/run_all_labs.py                    # Run all labs against local
    python scripts/run_all_labs.py --env aws           # Run against AWS
    python scripts/run_all_labs.py --only 1 3          # Run only labs 1 and 3
    python scripts/run_all_labs.py --dry-run            # Print commands without executing

Output:
    scripts/lab_results/local/lab-1-first-connection.json
    ...
"""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import quote

import httpx

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BASE_URLS: dict[str, str] = {
    "local": "http://localhost:8300",
    "aws": "https://mcp-server.dev.example.com",
    "azure": "https://mcp-server.dev.example.com",
}

RESULTS_DIR = Path(__file__).parent / "lab_results"

SERVER_RECOVERY_MAX_WAIT = 120
SERVER_RECOVERY_INTERVAL = 5


@dataclass
class LabResult:
    lab: int
    name: str
    checks: list[dict[str, str | bool]] = field(default_factory=list)
    raw_responses: list[dict] = field(default_factory=list)
    passed: bool = False
    duration_ms: float = 0.0


# ---------------------------------------------------------------------------
# Helpers — server crash resilience
# ---------------------------------------------------------------------------
def _wait_for_server(base_url: str, context: str = "") -> bool:
    """Wait for the server to become healthy again after a crash."""
    label = f" (after {context})" if context else ""
    print(f"\n    🔄 Server unreachable{label} — waiting for recovery...", flush=True)
    elapsed = 0
    while elapsed < SERVER_RECOVERY_MAX_WAIT:
        time.sleep(SERVER_RECOVERY_INTERVAL)
        elapsed += SERVER_RECOVERY_INTERVAL
        try:
            resp = httpx.get(f"{base_url}/health", timeout=5)
            if resp.status_code == 200:
                print(f"    ✅ Server recovered after {elapsed}s", flush=True)
                return True
        except Exception:
            pass
        print(f"    ⏳ Still waiting... ({elapsed}s / {SERVER_RECOVERY_MAX_WAIT}s)", flush=True)
    print(f"    ❌ Server did not recover within {SERVER_RECOVERY_MAX_WAIT}s", flush=True)
    return False


def _is_connection_error(e: Exception) -> bool:
    """Check if an exception is a server connection/crash error."""
    msg = str(e).lower()
    return any(pattern in msg for pattern in [
        "connection refused", "server disconnected", "connection reset",
        "connection closed", "remotedisconnected", "broken pipe", "eof occurred",
    ])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def api(
    client: httpx.Client,
    method: str,
    path: str,
    *,
    json_body: dict | None = None,
    max_retries: int = 2,
) -> httpx.Response:
    """Make an API call with automatic retry on server crashes."""
    base_url = str(client.base_url).rstrip("/")
    for attempt in range(max_retries + 1):
        try:
            fn = getattr(client, method.lower())
            kwargs: dict = {}
            if json_body is not None:
                kwargs["json"] = json_body
            return fn(path, **kwargs)
        except Exception as e:
            if _is_connection_error(e) and attempt < max_retries:
                if _wait_for_server(base_url, context=f"{path}, attempt {attempt + 1}"):
                    continue
            raise


def check(result: LabResult, name: str, passed: bool, notes: str = "") -> None:
    result.checks.append({"check": name, "passed": passed, "notes": notes})


def save_result(result: LabResult, env: str) -> None:
    out_dir = RESULTS_DIR / env
    out_dir.mkdir(parents=True, exist_ok=True)
    slug = result.name.lower().replace(" ", "-").replace(":", "")
    path = out_dir / f"lab-{result.lab}-{slug}.json"
    result.passed = all(c["passed"] for c in result.checks)
    data = {
        "lab": result.lab,
        "name": result.name,
        "passed": result.passed,
        "duration_ms": round(result.duration_ms, 1),
        "checks": result.checks,
        "raw_responses": result.raw_responses,
    }
    path.write_text(json.dumps(data, indent=2, default=str))
    status = "PASS" if result.passed else "FAIL"
    print(f"  Lab {result.lab}: {status} ({result.duration_ms:.0f}ms) -> {path.name}")


# ---------------------------------------------------------------------------
# Labs
# ---------------------------------------------------------------------------

def lab_1_first_connection(client: httpx.Client) -> LabResult:
    """Lab 1: First MCP Connection — health, tools list, resources list."""
    result = LabResult(lab=1, name="first-connection")
    t0 = time.time()

    # Health
    r = api(client, "GET", "/health")
    result.raw_responses.append({"health": r.json() if r.status_code == 200 else r.text})
    check(result, "Health returns 200", r.status_code == 200)
    if r.status_code == 200:
        check(result, "Status is healthy", r.json().get("status") == "healthy")

    # Tools list
    r = api(client, "GET", "/tools")
    result.raw_responses.append({"tools": r.json() if r.status_code == 200 else r.text})
    check(result, "Tools endpoint returns 200", r.status_code == 200)
    if r.status_code == 200:
        body = r.json()
        count = body.get("count", 0) if isinstance(body, dict) else len(body)
        check(result, "At least 5 tools available", count >= 5)

    # Resources list
    r = api(client, "GET", "/resources")
    result.raw_responses.append({"resources": r.json() if r.status_code == 200 else r.text})
    check(result, "Resources endpoint returns 200", r.status_code == 200)

    result.duration_ms = (time.time() - t0) * 1000
    return result


def lab_2_tool_execution(client: httpx.Client) -> LabResult:
    """Lab 2: Tool Execution — echo, database, data analysis, HTTP, portfolio health."""
    result = LabResult(lab=2, name="tool-execution")
    t0 = time.time()

    # Echo tool
    r = api(client, "POST", "/tools/echo/call", json_body={"message": "Hello MCP"})
    result.raw_responses.append({"echo": r.json() if r.status_code == 200 else r.text})
    check(result, "Echo tool returns 200", r.status_code == 200)

    # Database query
    r = api(client, "POST", "/tools/database_query/call", json_body={
        "query": "SELECT COUNT(*) as product_count FROM products",
    })
    result.raw_responses.append({"db_query": r.json() if r.status_code == 200 else r.text})
    check(result, "Database query returns 200", r.status_code == 200)

    # Data analysis
    r = api(client, "POST", "/tools/data_analysis/call", json_body={
        "table": "products",
        "operation": "summary",
    })
    result.raw_responses.append({"data_analysis": r.json() if r.status_code == 200 else r.text})
    check(result, "Data analysis returns 200", r.status_code == 200)

    # Portfolio health
    r = api(client, "POST", "/tools/portfolio_health/call", json_body={"service": "all"})
    result.raw_responses.append({"portfolio_health": r.json() if r.status_code == 200 else r.text})
    check(result, "Portfolio health returns 200", r.status_code == 200)

    result.duration_ms = (time.time() - t0) * 1000
    return result


def lab_3_resource_access(client: httpx.Client) -> LabResult:
    """Lab 3: Resource Access — schema, capabilities, portfolio services."""
    result = LabResult(lab=3, name="resource-access")
    t0 = time.time()

    # Schema resource
    r = api(client, "GET", f"/resources/{quote('database://schema', safe='')}")
    result.raw_responses.append({"schema": r.json() if r.status_code == 200 else r.text})
    check(result, "Schema resource returns 200", r.status_code == 200)

    # Capabilities resource
    r = api(client, "GET", f"/resources/{quote('mcp://capabilities', safe='')}")
    result.raw_responses.append({"capabilities": r.json() if r.status_code == 200 else r.text})
    check(result, "Capabilities resource returns 200", r.status_code == 200)

    # Portfolio services resource
    r = api(client, "GET", f"/resources/{quote('portfolio://services', safe='')}")
    result.raw_responses.append({"services": r.json() if r.status_code == 200 else r.text})
    check(result, "Portfolio services resource returns 200", r.status_code == 200)

    result.duration_ms = (time.time() - t0) * 1000
    return result


def lab_4_validation(client: httpx.Client) -> LabResult:
    """Lab 4: Input Validation & Error Handling."""
    result = LabResult(lab=4, name="validation")
    t0 = time.time()

    # Missing required field
    r = api(client, "POST", "/tools/database_query/call", json_body={})
    result.raw_responses.append({"missing_field": r.json() if r.status_code < 500 else r.text})
    check(result, "Missing field rejected", r.status_code in (400, 422) or (r.status_code == 200 and not r.json().get("success", True)))

    # SQL injection attempt
    r = api(client, "POST", "/tools/database_query/call", json_body={"query": "DROP TABLE products"})
    result.raw_responses.append({"sql_injection": r.json() if r.status_code < 500 else r.text})
    check(result, "SQL injection blocked", r.status_code in (400, 422) or (r.status_code == 200 and not r.json().get("success", True)))

    # Unknown tool
    r = api(client, "POST", "/tools/unknown_tool/call", json_body={})
    result.raw_responses.append({"unknown_tool": {"status": r.status_code}})
    check(result, "Unknown tool returns error", r.status_code in (400, 404, 422))

    # Invalid resource URI
    r = api(client, "GET", f"/resources/{quote('unknown://uri', safe='')}")
    result.raw_responses.append({"invalid_resource": {"status": r.status_code}})
    check(result, "Invalid resource returns error", r.status_code in (400, 404))

    result.duration_ms = (time.time() - t0) * 1000
    return result


def lab_5_claude_desktop(client: httpx.Client) -> LabResult:
    """Lab 5: Claude Desktop Integration — verify server is SSE-capable."""
    result = LabResult(lab=5, name="claude-desktop")
    t0 = time.time()

    # Verify health (server must be running for Claude)
    r = api(client, "GET", "/health")
    result.raw_responses.append({"health": r.json() if r.status_code == 200 else r.text})
    check(result, "Server healthy for Claude Desktop", r.status_code == 200)

    # Verify tools available
    r = api(client, "GET", "/tools")
    result.raw_responses.append({"tools": r.json() if r.status_code == 200 else r.text})
    check(result, "Tools available for Claude", r.status_code == 200)

    result.duration_ms = (time.time() - t0) * 1000
    return result


def lab_6_sse_streaming(client: httpx.Client) -> LabResult:
    """Lab 6: SSE Streaming — stream tool execution events."""
    result = LabResult(lab=6, name="sse-streaming")
    t0 = time.time()

    # Regular tool call (baseline)
    r = api(client, "POST", "/tools/echo/call", json_body={"message": "Hello Stream"})
    result.raw_responses.append({"regular": r.json() if r.status_code == 200 else r.text})
    check(result, "Regular tool call returns 200", r.status_code == 200)

    # SSE streaming (bypasses api() — has its own retry logic)
    base_url = str(client.base_url).rstrip("/")
    sse_path = "/stream/tools/echo?message=Hello%20Stream"
    sse_done = False
    for attempt in range(3):
        try:
            with client.stream("GET", sse_path) as stream:
                events: list[str] = []
                for line in stream.iter_lines():
                    if line.startswith("data:"):
                        events.append(line)
                    if len(events) > 10:
                        break
                result.raw_responses.append({"sse_events": len(events)})
                check(result, "SSE stream returns events", len(events) > 0)
            sse_done = True
            break
        except Exception as e:
            if _is_connection_error(e) and attempt < 2:
                if _wait_for_server(base_url, context=f"SSE stream, attempt {attempt + 1}"):
                    continue
            result.raw_responses.append({"sse_error": str(e)})
            check(result, "SSE stream returns events", False, notes=str(e))
            sse_done = True
            break
    if not sse_done:
        check(result, "SSE stream returns events", False, notes="All retries exhausted")

    result.duration_ms = (time.time() - t0) * 1000
    return result


def lab_7_provider_switching(client: httpx.Client) -> LabResult:
    """Lab 7: Provider Switching — verify current provider from health."""
    result = LabResult(lab=7, name="provider-switching")
    t0 = time.time()

    r = api(client, "GET", "/health")
    result.raw_responses.append({"health": r.json() if r.status_code == 200 else r.text})
    check(result, "Health returns 200", r.status_code == 200)

    # Test a query works (regardless of provider)
    r = api(client, "POST", "/tools/database_query/call", json_body={
        "query": "SELECT 1 as connected",
    })
    result.raw_responses.append({"query": r.json() if r.status_code == 200 else r.text})
    check(result, "Database query works with current provider", r.status_code == 200)

    result.duration_ms = (time.time() - t0) * 1000
    return result


def lab_8_docker_deployment(client: httpx.Client) -> LabResult:
    """Lab 8: Docker Deployment — health + tool execution from container."""
    result = LabResult(lab=8, name="docker-deployment")
    t0 = time.time()

    r = api(client, "GET", "/health")
    result.raw_responses.append({"health": r.json() if r.status_code == 200 else r.text})
    check(result, "Container health returns 200", r.status_code == 200)

    r = api(client, "GET", "/tools")
    result.raw_responses.append({"tools": r.json() if r.status_code == 200 else r.text})
    check(result, "Tools available from container", r.status_code == 200)

    r = api(client, "POST", "/tools/echo/call", json_body={"message": "Docker test"})
    result.raw_responses.append({"echo": r.json() if r.status_code == 200 else r.text})
    check(result, "Echo tool works from container", r.status_code == 200)

    result.duration_ms = (time.time() - t0) * 1000
    return result


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------
ALL_LABS: dict[int, callable] = {
    1: lab_1_first_connection,
    2: lab_2_tool_execution,
    3: lab_3_resource_access,
    4: lab_4_validation,
    5: lab_5_claude_desktop,
    6: lab_6_sse_streaming,
    7: lab_7_provider_switching,
    8: lab_8_docker_deployment,
}


def run_labs(base_url: str, env: str, only: list[int] | None = None, dry_run: bool = False) -> None:
    labs_to_run = {k: v for k, v in ALL_LABS.items() if only is None or k in only}

    print(f"\nMCP Server — Running {len(labs_to_run)} labs against {env} ({base_url})\n")

    if dry_run:
        for num, fn in labs_to_run.items():
            print(f"  [DRY RUN] Lab {num}: {fn.__doc__.strip().split(chr(10))[0] if fn.__doc__ else fn.__name__}")
        return

    passed = 0
    failed = 0

    with httpx.Client(base_url=base_url, timeout=60.0, headers={"Content-Type": "application/json"}) as client:
        for num, fn in labs_to_run.items():
            try:
                result = fn(client)
                save_result(result, env)
                if result.passed:
                    passed += 1
                else:
                    failed += 1
            except Exception as e:
                print(f"  Lab {num}: ERROR — {e}")
                failed += 1
                # If the server crashed, wait for recovery before the next lab
                if _is_connection_error(e):
                    _wait_for_server(base_url, context=f"lab {num} failure")

    print(f"\nResults: {passed} passed, {failed} failed")
    print(f"Details: {RESULTS_DIR / env}/")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run MCP Server hands-on labs")
    parser.add_argument("--env", choices=["local", "aws", "azure"], default="local")
    parser.add_argument("--only", nargs="+", type=int, help="Run only specific lab numbers")
    parser.add_argument("--dry-run", action="store_true", help="Print commands without executing")
    parser.add_argument("--base-url", help="Override base URL")
    args = parser.parse_args()

    base_url = args.base_url or BASE_URLS[args.env]
    run_labs(base_url, args.env, args.only, args.dry_run)


if __name__ == "__main__":
    main()
