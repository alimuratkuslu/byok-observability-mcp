# byok-observability-mcp

[![npm version](https://img.shields.io/npm/v/byok-observability-mcp)](https://www.npmjs.com/package/byok-observability-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Node ≥18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

A single MCP server that lets Claude Code query your observability stack — **Grafana**, **Prometheus**, **Kafka UI**, and **Datadog** — directly from your IDE.

**Bring Your Own Keys:** your credentials stay in environment variables on your machine. No data is sent to Anthropic. No cloning or building required — runs on demand via `npx`.

**Partial setup supported:** configure only the backends you use. Tools for unconfigured backends are never listed.

---

## How it works

```
Claude Code  ──►  byok-observability-mcp  (local npx process)
                          │
                          │  env vars — never leave your machine
                          ▼
          ┌───────────────────────────────┐
          │  Grafana  │  Prometheus       │
          │  Kafka UI │  Datadog (proxy)  │
          └───────────────────────────────┘
```

---

## Quick Start

### Step 1 — Create `.mcp.json` in your project root

Include only the backends you want. Delete the lines you don't need.

```json
{
  "mcpServers": {
    "observability-mcp": {
      "command": "npx",
      "args": ["-y", "byok-observability-mcp"],
      "env": {
        "GRAFANA_URL":    "https://grafana.mycompany.internal",
        "GRAFANA_TOKEN":  "glsa_...",
        "PROMETHEUS_URL": "https://prometheus.mycompany.internal",
        "KAFKA_UI_URL":   "https://kafka-ui.mycompany.internal",
        "DD_API_KEY":     "your-datadog-api-key",
        "DD_APP_KEY":     "your-datadog-app-key"
      }
    }
  }
}
```

> **Credentials in git?** Use the `${VAR}` approach instead — see [Keep credentials out of git](#keep-credentials-out-of-git).

### Step 2 — Start Claude Code

```bash
claude
```

Claude Code reads `.mcp.json` automatically. No `claude mcp add`, no build step.

### Step 3 — Verify

Ask Claude:

```
What observability tools do you have available?
```

Expected: Claude lists all tools for your configured backends.

---

## Tools

### Grafana

> Enabled when `GRAFANA_URL` + `GRAFANA_TOKEN` are set.

| Tool | Description |
|------|-------------|
| `grafana_health` | Check connectivity, version, and database status |
| `grafana_list_datasources` | List all datasources (name, type, UID) |
| `grafana_query_metrics` | Run a PromQL expression via a Grafana datasource |
| `grafana_list_dashboards` | Search and list dashboards by name or tag |
| `grafana_get_dashboard` | Get panels and metadata for a dashboard by UID |

### Prometheus

> Enabled when `PROMETHEUS_URL` is set.

| Tool | Description |
|------|-------------|
| `prometheus_health` | Check connectivity |
| `prometheus_query` | Instant PromQL query — current value of a metric |
| `prometheus_query_range` | Range PromQL query — how a metric changed over time |
| `prometheus_list_metrics` | List all available metric names |
| `prometheus_metric_metadata` | Get help text and type for a specific metric |

### Kafka UI

> Enabled when `KAFKA_UI_URL` is set.

| Tool | Description |
|------|-------------|
| `kafka_list_clusters` | List configured Kafka clusters and their status |
| `kafka_list_topics` | List topics in a cluster |
| `kafka_describe_topic` | Get partition count, replication factor, and config |
| `kafka_list_consumer_groups` | List consumer groups and their state |
| `kafka_consumer_group_lag` | Get per-partition lag for a consumer group |
| `kafka_broker_health` | Broker count and disk usage per broker |

### Datadog

> Enabled when both `DD_API_KEY` and `DD_APP_KEY` are set. Proxies the [official Datadog MCP server](https://docs.datadoghq.com/developers/mcp/).

Default toolsets: `core`, `apm`, `alerting`. Set `DD_TOOLSETS=all` to load everything.

| Toolset | Covers |
|---------|--------|
| `core` | Metrics, dashboards, monitors, infrastructure |
| `apm` | APM services, traces, service map |
| `alerting` | Monitors, downtimes, alerts |
| `logs` | Log search and analytics |
| `incidents` | Incident management |
| `ddsql` | SQL-style metric queries |
| `security` | Cloud security posture |
| `synthetics` | Synthetic test results |
| `networks` | Network performance monitoring |
| `dbm` | Database monitoring |
| `software-delivery` | CI/CD pipelines |
| `llm-obs` | LLM observability |
| `cases` | Case management |
| `feature-flags` | Feature flag tracking |

---

## Getting credentials

<details>
<summary><strong>Grafana — service account token</strong></summary>

1. Open Grafana → **Administration** → **Users and access** → **Service accounts**
2. Click **Add service account** → set Role to `Viewer` → **Create**
3. On the service account page → **Add service account token** → **Generate token**
4. Copy the token (starts with `glsa_`) — you won't see it again

```
GRAFANA_URL=https://grafana.mycompany.internal
GRAFANA_TOKEN=glsa_xxxxxxxxxxxxxxxx
```

If your Grafana uses a self-signed certificate:
```
GRAFANA_VERIFY_SSL=false
```

</details>

<details>
<summary><strong>Prometheus — URL (+ optional basic auth)</strong></summary>

If Prometheus has no authentication:
```
PROMETHEUS_URL=https://prometheus.mycompany.internal
```

If Prometheus uses basic auth:
```
PROMETHEUS_URL=https://prometheus.mycompany.internal
PROMETHEUS_USERNAME=your-username
PROMETHEUS_PASSWORD=your-password
```

</details>

<details>
<summary><strong>Kafka UI — URL (+ optional login)</strong></summary>

If Kafka UI has no authentication:
```
KAFKA_UI_URL=https://kafka-ui.mycompany.internal
```

If Kafka UI requires a login:
```
KAFKA_UI_URL=https://kafka-ui.mycompany.internal
KAFKA_UI_USERNAME=admin
KAFKA_UI_PASSWORD=your-password
```

</details>

<details>
<summary><strong>Datadog — API key + Application key</strong></summary>

**API key:** Datadog → **Organization Settings** → **API Keys** → New Key

**Application key:** Datadog → **Organization Settings** → **Application Keys** → New Key

**DD_SITE** — match your Datadog login URL:

| Login URL | DD_SITE |
|-----------|---------|
| `app.datadoghq.com` | `datadoghq.com` (default) |
| `app.us3.datadoghq.com` | `us3.datadoghq.com` |
| `app.us5.datadoghq.com` | `us5.datadoghq.com` |
| `app.datadoghq.eu` | `datadoghq.eu` |
| `app.ap1.datadoghq.com` | `ap1.datadoghq.com` |

```
DD_API_KEY=your-api-key
DD_APP_KEY=your-application-key
DD_SITE=datadoghq.com
DD_TOOLSETS=core,apm,alerting
```

</details>

---

## Configuration

### Method A — Values directly in `.mcp.json` (simplest)

Put credentials directly in `.mcp.json`. Works everywhere, no extra steps.

Add `.mcp.json` to your `.gitignore` if the repo is shared.

### Method B — Keep credentials out of git

Use `${VAR}` placeholders in `.mcp.json` and put real values in `.env`.

**`.mcp.json`** (safe to commit — contains no secrets):

```json
{
  "mcpServers": {
    "observability-mcp": {
      "command": "npx",
      "args": ["-y", "byok-observability-mcp"],
      "env": {
        "GRAFANA_URL":    "${GRAFANA_URL}",
        "GRAFANA_TOKEN":  "${GRAFANA_TOKEN}",
        "PROMETHEUS_URL": "${PROMETHEUS_URL}",
        "KAFKA_UI_URL":   "${KAFKA_UI_URL}",
        "DD_API_KEY":     "${DD_API_KEY}",
        "DD_APP_KEY":     "${DD_APP_KEY}"
      }
    }
  }
}
```

**`.env`** (add to `.gitignore`):

```
GRAFANA_URL=https://grafana.mycompany.internal
GRAFANA_TOKEN=glsa_...
```

Start Claude with the env loaded:

```bash
set -a && source .env && set +a && claude
```

A ready-made helper script is included:

```bash
./scripts/run-claude-with-env.sh
```

A template `.mcp.json` with all variables is available as [`.mcp.json.example`](./.mcp.json.example).

### Method C — Global config (available in every project)

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "observability-mcp": {
      "command": "npx",
      "args": ["-y", "byok-observability-mcp"],
      "env": {
        "GRAFANA_URL":   "https://grafana.mycompany.internal",
        "GRAFANA_TOKEN": "glsa_..."
      }
    }
  }
}
```

---

## Environment variables

| Variable | Backend | Required | Description |
|----------|---------|----------|-------------|
| `GRAFANA_URL` | Grafana | Yes | Base URL of your Grafana instance |
| `GRAFANA_TOKEN` | Grafana | Yes | Service account token (Viewer role) |
| `GRAFANA_VERIFY_SSL` | Grafana | No | Set to `false` to skip TLS verification |
| `PROMETHEUS_URL` | Prometheus | Yes | Base URL of your Prometheus instance |
| `PROMETHEUS_USERNAME` | Prometheus | No | Basic auth username |
| `PROMETHEUS_PASSWORD` | Prometheus | No | Basic auth password |
| `KAFKA_UI_URL` | Kafka UI | Yes | Base URL of your Kafka UI instance |
| `KAFKA_UI_USERNAME` | Kafka UI | No | Login username |
| `KAFKA_UI_PASSWORD` | Kafka UI | No | Login password |
| `DD_API_KEY` | Datadog | Yes | Datadog API key |
| `DD_APP_KEY` | Datadog | Yes | Datadog Application key |
| `DD_SITE` | Datadog | No | Datadog site (default: `datadoghq.com`) |
| `DD_TOOLSETS` | Datadog | No | Tool groups to load (default: `core,apm,alerting`) |

---

## Example prompts

### Grafana

```
List all Grafana datasources and tell me which ones are Prometheus type.
```

```
Search for dashboards related to "kubernetes" and list their names and UIDs.
```

```
Query the metric 'http_requests_total' via the default Prometheus datasource. Show the rate over the last hour.
```

### Prometheus

```
What is the current value of the 'up' metric? Which targets are down?
```

```
Show CPU usage (rate of node_cpu_seconds_total) over the past hour, broken down by instance.
```

```
List all available metrics that start with 'http_'.
```

### Kafka UI

```
List all Kafka clusters. Are there any with offline brokers?
```

```
Describe the topic 'orders' in cluster 'production'. How many partitions and what is the replication factor?
```

```
Check consumer lag for group 'order-processor' in cluster 'production'. Which partitions have the highest lag?
```

### Datadog

```
List all Datadog monitors that are currently in Alert state.
```

```
Show APM service performance for the past hour. Which services have the highest error rate?
```

```
Query 'aws.ec2.cpuutilization' for the last 30 minutes. Which hosts are above 80%?
```

### Cross-backend

```
Check the health of all configured observability backends and give me a summary of which ones are reachable.
```

```
I'm seeing high error rates. Check Prometheus for http_requests_total with status=500, then look for related Datadog monitors that might be alerting.
```

---

## Security

- Credentials are read from environment variables and never logged or sent to Anthropic
- Tokens are redacted in all error messages
- TLS certificate verification is enabled by default
- All tools are **read-only** — no write operations are performed on any backend
- The MCP process runs locally — your infrastructure URLs only reach Claude's context window if you type them into the chat

**Least-privilege recommendations:**

| Backend | Recommended role |
|---------|-----------------|
| Grafana | Service account with **Viewer** role |
| Prometheus | Network-level read-only access |
| Kafka UI | Read-only UI user |
| Datadog | API key + Application key with read scopes |

---

## Development

```bash
git clone https://github.com/alimuratkuslu/byok-observability-mcp
cd byok-observability-mcp
npm install
npm run dev          # run with tsx (no build step)
npm run build        # compile to dist/
npm run typecheck    # TypeScript check without emitting
```

---

## Tested versions

| Backend | Tested version |
|---------|---------------|
| Grafana | v9.x, v10.x, v11.x |
| Prometheus | v2.x |
| Kafka UI | `provectus/kafka-ui:v0.7.2` |

---

## License

MIT
