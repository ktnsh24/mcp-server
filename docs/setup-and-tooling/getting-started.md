# Getting Started — MCP Server

> **Time to first tool call:** ~5 minutes (local) | ~20 minutes (cloud deployment)

---

## Table of Contents

- [What you need before starting](#what-you-need-before-starting)
- [Step 1 — Install Node.js 20+](#step-1--install-nodejs-20)
- [Step 2 — Clone and install dependencies](#step-2--clone-and-install-dependencies)
- [Step 3 — Configure environment variables](#step-3--configure-environment-variables)
- [Step 4 — Build and start the server](#step-4--build-and-start-the-server)
- [Step 5 — Test the Server](#step-5--test-the-server)
- [Step 6 — Integration with Claude Desktop](#step-6--integration-with-claude-desktop)
- [Step 7 — Docker](#step-7--docker)
- [Step 8 — Run Labs Locally](#step-8--run-labs-locally)
- [Step 9 — Connect to AWS (and run on AWS)](#step-9--connect-to-aws-and-run-on-aws)
- [Step 10 — Connect to Azure (and run on Azure)](#step-10--connect-to-azure-and-run-on-azure)
- [Step 11 — Run the Tests](#step-11--run-the-tests)
- [Step 12 — TypeScript Development](#step-12--typescript-development)
- [Step 13 — Project Structure](#step-13--project-structure)
- [Troubleshooting](#troubleshooting)

---

## What you need before starting

| Tool | Version | Why you need it |
| --- | --- | --- |
| **Node.js** | 20+ | The server is written in TypeScript |
| **npm** | 10+ | Package manager (bundled with Node.js) |
| **Git** | 2.40+ | Version control |
| **PostgreSQL** | 16+ | Optional — server defaults to in-memory DB |
| **AWS CLI** | 2.x | Connect to AWS services (optional) |
| **Azure CLI** | 2.x | Connect to Azure services (optional) |
| **Terraform** | 1.5+ | Deploy cloud infrastructure (optional) |

### Check what is already installed

```bash
node --version         # Need 20+
npm --version          # Need 10+
git --version          # Need 2.40+
aws --version          # Optional
az --version           # Optional
terraform --version    # Optional
```

---

## Step 1 — Install Node.js 20+

```bash
# Ubuntu / WSL (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version   # v20.x.x
npm --version    # 10.x.x
```

---

## Step 2 — Clone and install dependencies

```bash
cd repos/mcp-server

# Install dependencies
npm install

# Verify
npm ls --depth=0
```

---

## Step 3 — Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with these key settings:

| Variable | Default | Description |
| --- | --- | --- |
| `MCP_TRANSPORT` | `sse` | Transport mode: `stdio` (Claude Desktop) or `sse` (HTTP) |
| `MCP_PORT` | `8300` | Server port (SSE mode only) |
| `MCP_API_KEY` | _(empty)_ | Optional API key for authentication |
| `POSTGRES_HOST` | _(empty)_ | PostgreSQL host (leave empty for in-memory DB) |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `POSTGRES_USER` | `mcp_user` | PostgreSQL user |
| `POSTGRES_PASSWORD` | _(empty)_ | PostgreSQL password |
| `POSTGRES_DB` | `mcp_data` | PostgreSQL database name |

**Default config (works out of the box — no database needed):**

```bash
MCP_TRANSPORT=sse
MCP_PORT=8300
# No POSTGRES_* = uses in-memory SQLite
```

**With PostgreSQL:**

```bash
MCP_TRANSPORT=sse
MCP_PORT=8300
POSTGRES_HOST=localhost
POSTGRES_USER=mcp_user
POSTGRES_PASSWORD=mcp_pass
POSTGRES_DB=mcp_data
```

---

## Step 4 — Build and start the server

```bash
# Build TypeScript → JavaScript
npm run build

# Start in SSE mode (HTTP — for browser/curl testing)
npm run dev:sse
# → Server listening on http://localhost:8300

# OR — Start in stdio mode (for Claude Desktop integration)
npm run dev:stdio
```

---

## Step 5 — Test the Server

### Health check

```bash
curl http://localhost:8300/health | jq
```

Expected: `{ "status": "healthy", "version": "0.1.0", "tools": 5 }`

### List tools

```bash
curl http://localhost:8300/tools | jq '.tools[].name'
```

Expected: `echo`, `database_query`, `data_analysis`, `http_api`, `portfolio_health`

### Execute echo tool

```bash
curl -X POST http://localhost:8300/tools/echo/call \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello MCP"}' | jq '.result'
```

Expected: `Echo: Hello MCP`

### Query database

```bash
curl -X POST http://localhost:8300/tools/database_query/call \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT * FROM products LIMIT 3"}' | jq '.result'
```

### Get database schema

```bash
curl http://localhost:8300/resources/database%3A%2F%2Fschema | jq '.content'
```

### Stream tool execution

```bash
curl -N http://localhost:8300/stream/tools/database_query?query=SELECT%20COUNT%28*%29%20FROM%20products
```

---

## Step 6 — Integration with Claude Desktop

The MCP server can connect directly to Claude Desktop via the stdio transport.

### Configure Claude Desktop

Create or edit `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mcp-server": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

> Replace `/absolute/path/to/mcp-server/` with the real path to your clone.

### Restart Claude Desktop

Close and reopen Claude Desktop. The MCP server tools will appear in Claude's tools dropdown.

---

## Step 7 — Docker

### Build and run

```bash
docker compose up -d
docker compose logs -f app
```

### Test

```bash
curl http://localhost:8300/health
```

### Cleanup

```bash
docker compose down -v
```

---

## Step 8 — Run Labs Locally

Once the server is running (see [Step 4](#step-4--build-and-start-the-server)), you can run all 8 hands-on labs.

**Cost: $0. No cloud accounts needed. Runs entirely on your machine.**

### 8a. Automated (recommended)

```bash
# 1. Start the server (in one terminal)
npm run dev:sse

# 2. Run all labs (in another terminal)
npx ts-node scripts/run_all_labs.ts --env local
```

This runs all 8 hands-on labs and prints a pass/fail report.

No infrastructure to deploy or destroy — it's all local.

**Results are saved to:** `scripts/lab_results/local/`

### 8b. Or run manually (step by step)

```bash
# Start the server
npm run dev:sse

# Then test manually through http://localhost:8300
```

**Results location:** `scripts/lab_results/local/`

> **Note:** `run_cloud_labs.sh` is for cloud deployments only (AWS/Azure). It wraps
> `terraform apply` → labs → `terraform destroy`. For local development, use
> `run_all_labs.ts` directly as shown above.

---

## Step 9 — Connect to AWS (and run on AWS)

### 9a. Install AWS CLI

```bash
# Ubuntu / WSL
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
aws --version
```

### 9b. Configure AWS credentials

**Option A: Access keys (simplest for personal account)**

```bash
aws configure
# AWS Access Key ID: <paste your key>
# AWS Secret Access Key: <paste your secret>
# Default region name: eu-west-1
# Default output format: json
```

Get your access keys from: AWS Console → IAM → Users → Your User → Security credentials → Create access key.

**Option B: SSO (if your account uses AWS Organizations)**

```bash
aws configure sso --profile mcp-server
# Follow the prompts for SSO start URL, region, account, role
```

### 9c. Verify AWS connectivity

```bash
aws sts get-caller-identity
# Should show your account ID and ARN
```

### Cost-saving tips for AWS

- **ECS Fargate**: Pay-per-second. A typical lab session (1-2 hours) costs < $1.
- **⚠️ Always destroy after labs** — the budget guard (€5 default) is your safety net.

### 9d. Deploy and run labs (automated)

```bash
./scripts/run_cloud_labs.sh --provider aws --email you@example.com
```

The script automatically:

1. `terraform apply` — deploys ECS and a budget guard
2. Starts the MCP server with cloud configuration
3. Runs all 8 hands-on labs against AWS
4. Prints a pass/fail completion report
5. `terraform destroy` — tears down ALL infrastructure (even on Ctrl+C or errors)

**Budget control:** The default budget limit is €5. To increase it:

```bash
./scripts/run_cloud_labs.sh --provider aws --email you@example.com --cost-limit 15
```

**Results are saved to:** `scripts/lab_results/aws/`

### 9e. Or deploy and run manually (step by step)

```bash
# 1. Deploy infrastructure
cd infra/aws
terraform init
terraform apply -var="cost_limit_eur=5" -var="alert_email=you@example.com"

# 2. Update .env with cloud settings

# 3. Start the server
cd ../..  # back to repo root
npm run dev:sse

# 4. Run labs automatically (in another terminal)
npx ts-node scripts/run_all_labs.ts --env aws

# OR — test manually through http://localhost:8300

# 5. ALWAYS destroy when done
cd infra/aws
terraform destroy -var="cost_limit_eur=5" -var="alert_email=you@example.com"
```

> ⚠️ **CAUTION — Manual mode means manual cleanup!** When running manually, there
> is no automatic `terraform destroy` on exit. Monitor your costs in the
> [AWS Billing Console](https://console.aws.amazon.com/billing/)
> and **always run `terraform destroy` when finished.**

**Results location:** `scripts/lab_results/aws/`

---

## Step 10 — Connect to Azure (and run on Azure)

### 10a. Install Azure CLI

```bash
# Ubuntu / WSL
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
az --version
```

### 10b. Login to Azure

```bash
az login
# Opens a browser — sign in with your Azure account

# Set the active subscription (if you have multiple)
az account set --subscription "your-subscription-id"
```

### 10c. Verify Azure connectivity

```bash
az account show
# Should show your subscription
```

### Cost-saving tips for Azure

- **Container Apps**: Pay-per-second. Costs < $1 for a typical lab session.
- **⚠️ Always destroy after labs** — the budget guard (€5 default) is your safety net.

### 10d. Deploy and run labs (automated)

```bash
./scripts/run_cloud_labs.sh --provider azure --email you@example.com
```

The script automatically:

1. `terraform apply` — deploys Container Apps and a budget guard
2. Starts the MCP server with cloud configuration
3. Runs all 8 hands-on labs against Azure
4. Prints a pass/fail completion report
5. `terraform destroy` — tears down ALL infrastructure (even on Ctrl+C or errors)

**Budget control:**

```bash
./scripts/run_cloud_labs.sh --provider azure --email you@example.com --cost-limit 15
```

**Results are saved to:** `scripts/lab_results/azure/`

### 10e. Or deploy and run manually (step by step)

```bash
# 1. Deploy infrastructure
cd infra/azure
terraform init
terraform apply -var="cost_limit_eur=5" -var="alert_email=you@example.com"

# 2. Update .env with cloud settings

# 3. Start the server
cd ../..  # back to repo root
npm run dev:sse

# 4. Run labs automatically (in another terminal)
npx ts-node scripts/run_all_labs.ts --env azure

# OR — test manually through http://localhost:8300

# 5. ALWAYS destroy when done
cd infra/azure
terraform destroy -var="cost_limit_eur=5" -var="alert_email=you@example.com"
```

> ⚠️ **CAUTION — Manual mode means manual cleanup!** When running manually, there
> is no automatic `terraform destroy` on exit. Monitor your costs in the
> [Azure Cost Management](https://portal.azure.com/#view/Microsoft_Azure_CostManagement)
> and **always run `terraform destroy` when finished.**

**Results location:** `scripts/lab_results/azure/`

---

## Step 11 — Run the Tests

```bash
npm run test              # Run once
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report
```

---

## Step 12 — TypeScript Development

### Watch mode

```bash
npm run dev:sse
# Auto-recompiles on changes
```

### Type checking

```bash
npm run typecheck
```

### Linting and formatting

```bash
npm run lint
npm run lint:fix
npm run format
```

---

## Step 13 — Project Structure

```text
mcp-server/
├── src/
│   ├── index.ts              ← Entry point (stdio/SSE switch)
│   ├── config.ts             ← Environment config
│   ├── server.ts             ← MCP server setup + tool registration
│   ├── transport/
│   │   ├── stdio.ts          ← Stdio transport (Claude Desktop)
│   │   └── sse.ts            ← SSE transport (HTTP)
│   ├── tools/
│   │   ├── echo.ts           ← Echo tool (hello world)
│   │   ├── database_query.ts ← SQL query tool
│   │   ├── data_analysis.ts  ← Data analysis tool
│   │   ├── http_api.ts       ← HTTP API tool
│   │   └── portfolio_health.ts ← Portfolio health check
│   ├── resources/
│   │   └── schema.ts         ← Database schema resource
│   └── db/
│       ├── memory.ts         ← In-memory SQLite
│       └── postgres.ts       ← PostgreSQL connector
├── scripts/
│   ├── run_all_labs.ts       ← 8 automated lab experiments
│   ├── run_cloud_labs.sh     ← One-command cloud deploy → run → destroy
│   └── lab_results/          ← Lab output (local/, aws/, azure/)
├── tests/
├── docs/
├── infra/
│   ├── aws/main.tf
│   └── azure/main.tf
├── docker-compose.yml
├── Dockerfile
├── tsconfig.json
└── package.json
```

---

## Troubleshooting

### Port already in use

```bash
lsof -i :8300
kill -9 <PID>
npm run dev:sse
```

### Compilation errors

```bash
rm -rf dist node_modules
npm install
npm run build
```

### Database connection failed

The server defaults to in-memory database. To use PostgreSQL:

```bash
# Start PostgreSQL first
docker run -d --name postgres \
  -e POSTGRES_PASSWORD=mcp_pass \
  -e POSTGRES_DB=mcp_data \
  -p 5432:5432 \
  postgres:16

# Update .env
POSTGRES_HOST=localhost
POSTGRES_USER=mcp_user
POSTGRES_PASSWORD=mcp_pass

npm run dev:sse
```

### Claude Desktop not detecting tools

1. Make sure you used the **absolute path** in `claude_desktop_config.json`
2. Make sure `npm run build` completed without errors
3. Restart Claude Desktop completely (not just close the window)

### Terraform errors

```bash
cd infra/aws   # or infra/azure
terraform init -upgrade
terraform plan -var="cost_limit_eur=5" -var="alert_email=you@example.com"
```
