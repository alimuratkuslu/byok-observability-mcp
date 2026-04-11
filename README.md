# observability-mcp

A single MCP (Model Context Protocol) server that lets Claude Code query your self-hosted observability stack — **Grafana**, **Prometheus**, and **Kafka UI** — directly from your IDE.

No data is sent to any hosted service. Your credentials stay in your environment variables, and all traffic flows directly between the MCP process on your machine and your own infrastructure.

> See [PRD.md](./PRD.md) for the full product vision, BYOK model, security design, and roadmap.

---

## Quick Start

Add to Claude Code with a single command. Only include `--env` flags for the backends you actually have.

```bash
claude mcp add --transport stdio observability-mcp \
  --env GRAFANA_URL="https://grafana.myco.internal" \
  --env GRAFANA_TOKEN="glsa_..." \
  --env PROMETHEUS_URL="https://prometheus.myco.internal" \
  --env KAFKA_UI_URL="https://kafka-ui.myco.internal" \
  --env KAFKA_UI_USERNAME="admin" \
  --env KAFKA_UI_PASSWORD="your-password" \
  --env DD_API_KEY="your-datadog-api-key" \
  --env DD_APP_KEY="your-datadog-application-key" \
  --env DD_SITE="datadoghq.com" \
  --env DD_TOOLSETS="core,apm,alerting" \
  -- npx -y byok-observability-mcp
```

No clone or build step required. See [instructions.md](./instructions.md) for step-by-step credential setup and example prompts.

---

## Tools

### Grafana
| Tool | Description |
|------|-------------|
| `grafana_health` | Check Grafana connectivity and version |
| `grafana_list_datasources` | List all configured datasources (name, type, UID) |
| `grafana_query_metrics` | Execute a PromQL expression via a Grafana Prometheus datasource |
| `grafana_list_dashboards` | Search and list dashboards |
| `grafana_get_dashboard` | Get dashboard panels and metadata by UID |

### Prometheus
| Tool | Description |
|------|-------------|
| `prometheus_health` | Check Prometheus connectivity |
| `prometheus_query` | Instant PromQL query — current value of a metric |
| `prometheus_query_range` | Range PromQL query — how a metric changed over time |
| `prometheus_list_metrics` | List all available metric names |
| `prometheus_metric_metadata` | Get help text and type for a metric |

### Kafka UI
| Tool | Description |
|------|-------------|
| `kafka_list_clusters` | List configured Kafka clusters |
| `kafka_list_topics` | List topics in a cluster |
| `kafka_describe_topic` | Get detailed topic info (partitions, replication) |
| `kafka_list_consumer_groups` | List consumer groups and their state |
| `kafka_consumer_group_lag` | Get per-partition lag for a consumer group |
| `kafka_broker_health` | Broker count and disk usage |

---

## Setup

### Requirements
- Node.js 18 or higher
- Claude Code CLI

### 1. Add to Claude Code config

Edit your Claude Code MCP config (Settings → MCP Servers, or `~/.claude.json`) and add:

```json
{
  “mcpServers”: {
    “observability”: {
      “command”: “npx”,
      “args”: [“-y”, “byok-observability-mcp”],
      “env”: {
        “GRAFANA_URL”: “https://grafana.myco.internal”,
        “GRAFANA_TOKEN”: “glsa_...”,
        “PROMETHEUS_URL”: “https://prometheus.myco.internal”,
        “KAFKA_UI_URL”: “https://kafka-ui.myco.internal”,
        “KAFKA_UI_USERNAME”: “admin”,
        “KAFKA_UI_PASSWORD”: “your-password”
      }
    }
  }
}
```

Only set the environment variables for backends you actually have. Tools for unconfigured backends return a helpful “not configured” message rather than crashing.

### 2. (Alternative) Run from source

```bash
git clone https://github.com/yourorg/observability-mcp
cd observability-mcp
npm install
npm run build
```

Then in your Claude Code config:

```json
{
  “mcpServers”: {
    “observability”: {
      “command”: “node”,
      “args”: [“/absolute/path/to/observability-mcp/dist/index.js”],
      “env”: {
        “GRAFANA_URL”: “https://grafana.myco.internal”,
        “GRAFANA_TOKEN”: “glsa_...”
      }
    }
  }
}
```

---

## Environment Variables

| Variable | Required for | Description |
|----------|-------------|-------------|
| `GRAFANA_URL` | Grafana tools | Base URL of your Grafana instance |
| `GRAFANA_TOKEN` | Grafana tools | Service account token (Viewer role recommended) |
| `GRAFANA_VERIFY_SSL` | Grafana tools | Set to `false` to skip TLS verification (default: `true`) |
| `PROMETHEUS_URL` | Prometheus tools | Base URL of your Prometheus instance |
| `PROMETHEUS_USERNAME` | Prometheus tools | Optional basic auth username |
| `PROMETHEUS_PASSWORD` | Prometheus tools | Optional basic auth password |
| `KAFKA_UI_URL` | Kafka UI tools | Base URL of your provectus/kafka-ui instance |
| `KAFKA_UI_USERNAME` | Kafka UI tools | Optional basic auth username |
| `KAFKA_UI_PASSWORD` | Kafka UI tools | Optional basic auth password |

---

## Least-privilege recommendations

| Backend | Recommended role |
|---------|-----------------|
| Grafana | Service account with **Viewer** role |
| Prometheus | Read-only (use network-level access control) |
| Kafka UI | Read-only UI user |

All tools are **read-only**. No write operations are performed.

---

## Security

**Data flow:**

```
Your machine (MCP process)
    ↕ env vars (never leave your machine)
Your infrastructure (Grafana / Prometheus / Kafka UI)
    ↕ HTTPS
MCP process serializes tool results as text
    ↕ stdin/stdout (local pipe to Claude Code)
Claude API (only what's in the conversation window)
```

- Credentials are read from environment variables and never logged.
- Tokens are redacted in all error messages.
- TLS certificate verification is enabled by default.
- The MCP process runs locally — your infrastructure URLs are never sent to Anthropic unless you explicitly paste them into the chat.

---

## Tested versions

| Backend | Tested version |
|---------|---------------|
| Grafana | v9.x, v10.x, v11.x |
| Prometheus | v2.x |
| Kafka UI | `provectus/kafka-ui:v0.7.2` |

---

## Datadog

For Datadog, use the [official Datadog MCP server](https://docs.datadoghq.com/developers/mcp/). Add it as a separate entry in your `mcpServers` config alongside this server.

---

## Development

```bash
npm install
npm run dev          # run with tsx (no build step)
npm run build        # compile to dist/
npm run typecheck    # TypeScript check without emitting
```

---

## License

MIT
