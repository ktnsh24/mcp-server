# Cost Analysis — MCP Server

> How much does it cost to run mcp-server locally vs on cloud?

## Table of Contents

- [Local Development — FREE](#local-development--free)
- [Cloud Cost Estimates](#cloud-cost-estimates)
  - [AWS](#aws)
  - [Azure](#azure)
- [Cost of Running Tests on Cloud](#cost-of-running-tests-on-cloud)
- [Budget Guard — Automatic Cost Protection](#budget-guard--automatic-cost-protection)

---

## Local Development — FREE

| Component | Technology | Cost |
| --- | --- | --- |
| MCP Server | Node.js + Express (local) | **$0** |
| Database | PostgreSQL (local Docker) | **$0** |
| Transport | stdio / SSE (local) | **$0** |

**Total local cost: $0**

---

## Cloud Cost Estimates

### AWS

| Service | Purpose | Monthly Cost | Notes |
| --- | --- | --- | --- |
| ECS Fargate | Container hosting | ~$15–25 | 0.25 vCPU / 512MB |
| ALB | Load balancer + SSE | ~$18 | Fixed + per-LCU |
| ECR | Container registry | ~$1 | Image storage |
| CloudWatch | Logs | ~$1 | Log ingestion |
| **Total** | | **~$35–45/mo** | |

### Azure

| Service | Purpose | Monthly Cost | Notes |
| --- | --- | --- | --- |
| Container Apps | Container hosting | ~$10–20 | Consumption plan |
| Azure Database for PostgreSQL | Tool registry | ~$15 | Flexible Server (Burstable B1ms) |
| **Total** | | **~$25–35/mo** | |

---

## Cost of Running Tests on Cloud

| Provider | API Calls | Infra Cost | Total per Run |
| --- | --- | --- | --- |
| **Local** | ~30 | $0 | **$0** |
| **AWS** | ~30 | ~$0.15 (hourly ECS+ALB) | **~$0.15** |
| **Azure** | ~30 | ~$0.10 (hourly Container Apps) | **~$0.10** |

> **Recommendation:** Run tests locally ($0), then once on each cloud provider to verify transport compatibility. Total cloud cost: **~$0.25 one-time**.

---

## Budget Guard — Automatic Cost Protection

Both `infra/aws/` and `infra/azure/` include a **budget guard** (`budget.tf`) that automatically protects against runaway cloud costs.

### How it works

| Threshold | Action |
| --- | --- |
| **80% of limit (€4)** | Email warning sent to `alert_email` |
| **100% of limit (€5)** | Email + automatic resource kill switch triggered |

### AWS

- **AWS Budget** monitors tagged resources (`service=mcp-server`)
- **SNS → Lambda** pipeline: at 100%, a Lambda function scales ECS to 0
- File: `infra/aws/budget.tf` + `infra/aws/budget_killer_lambda/handler.py`

### Azure

- **Azure Consumption Budget** scoped to the resource group
- **Action Group → Automation Runbook**: at 100%, a PowerShell runbook deletes all resources in the resource group
- File: `infra/azure/budget.tf`

### Configuration

```hcl
variable "cost_limit_eur" {
  default = 5  # €5 kill switch
}

variable "alert_email" {
  # Required — where budget warnings go
}
```

### ⚠️ Important caveat

Cloud cost reporting has a **6–24 hour lag**. The budget guard is your **safety net**, not your primary defense. Always run:

```bash
terraform destroy  # immediately after finishing labs
```

