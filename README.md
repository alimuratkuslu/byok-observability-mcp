<div align="center">
  <img src="./assets/logo.png" height="120" alt="byok-observability-mcp">

  <h1>byok-observability-mcp</h1>

  <p><strong>Query your observability stack from Claude Code — no data leaves your machine.</strong></p>

  [![npm version](https://img.shields.io/npm/v/byok-observability-mcp)](https://www.npmjs.com/package/byok-observability-mcp)
  [![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
  [![Node ≥18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

  <p>
    <img src="https://img.shields.io/badge/Grafana-F46800?logo=grafana&logoColor=white" alt="Grafana">
    <img src="https://img.shields.io/badge/Prometheus-E6522C?logo=prometheus&logoColor=white" alt="Prometheus">
    <img src="https://img.shields.io/badge/Kafka_UI-231F20?logo=apachekafka&logoColor=white" alt="Kafka UI">
    <img src="https://img.shields.io/badge/Datadog-632CA6?logo=datadog&logoColor=white" alt="Datadog">
  </p>
</div>

---

**Bring Your Own Keys** — credentials stay in env vars on your machine. No clone, no build, runs via `npx`.

**Partial setup** — configure only the backends you use. Tools for unconfigured backends are never exposed.

<p align="center">
  <a href="#-quick-start">Quick Start</a> · 
  <a href="#-available-tools">Tools</a> · 
  <a href="#-getting-credentials">Credentials</a> · 
  <a href="#%EF%B8%8F-configuration">Configuration</a> · 
  <a href="#-example-prompts">Examples</a> · 
  <a href="#-security">Security</a> · 
  <a href="#-development">Development</a>
</p>

---

## How it works

```
Claude Code / Codex CLI
        │
        ▼
byok-observability-mcp  (local npx process)
        │
        │  env vars — never leave your machine
        ▼
┌────────────────────────────────┐
│  Grafana  ·  Prometheus        │
│  Kafka UI ·  Datadog (proxy)   │
└────────────────────────────────┘
```

---

## ⚡ Quick Start

### Option A — Interactive wizard (recommended)

Run once, answer a few questions, get a ready-made `.mcp.json`:

```bash
npx byok-observability-mcp --init
```

The wizard will:
- Let you pick which backends to configure
- Ask for credentials per service
- Test connectivity with your real endpoints before writing anything
- Write `.mcp.json` to your project root or `~/.claude/` — your choice

Then just start Claude Code:

```bash
claude
```

> [!TIP]
> **That's it.** No clone, no build, no env file. Works in under 60 seconds.

---

### Option B — Manual `.mcp.json`

Create `.mcp.json` in your project root. Include **only** the backends you need.

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

> **Credentials in git?** Use the `${VAR}` approach instead — see [Configuration → Method B](#method-b--keep-credentials-out-of-git).

Start Claude Code:

```bash
claude
```

Claude Code reads `.mcp.json` automatically. No `claude mcp add`, no build step.

Verify by asking Claude:

```
What observability tools do you have available?
```

---

## 🧩 Supported clients

| Client | Configuration |
|--------|--------------|
| **Claude Code** | `.mcp.json` in project root (recommended) or `claude mcp add` CLI |
| **OpenAI Codex CLI** | `.mcp.json` in project root — same format as Claude Code |

Both clients read `.mcp.json` automatically. The Quick Start above works for either.

<details>
<summary><strong>Codex CLI example</strong></summary>

```bash
# Same .mcp.json as above works out of the box
codex
```

Or add via CLI:
```bash
codex mcp add --transport stdio observability-mcp -- npx -y byok-observability-mcp
```

</details>

---

## 🔧 Available tools

<details open>
<summary>🛰️ <strong>System</strong> — 1 tool</summary>

> Always available. Checks connectivity across all configured backends.

| Tool | Description |
|------|-------------|
| `obs_health_check` | **Unified Health Check.** Runs a parallel check on all backends and returns a status table. |

</details>

<details>
<summary><img src="https://img.shields.io/badge/Grafana-F46800?logo=grafana&logoColor=white" alt="Grafana" height="18"> &nbsp;<strong>7 tools</strong></summary>

> Enabled when `GRAFANA_URL` + `GRAFANA_TOKEN` are set.

| Tool | Description |
|------|-------------|
| `grafana_health` | Check connectivity, version, and database status |
| `grafana_list_datasources` | List all datasources (name, type, UID) |
| `grafana_query_metrics` | Run a PromQL expression via a Grafana datasource |
| `grafana_list_dashboards` | Search and list dashboards by name or tag |
| `grafana_get_dashboard` | Get panels and metadata for a dashboard by UID |
| `grafana_list_alerts` | List active alerts from Alertmanager (firing/pending) |
| `grafana_get_alert_rules` | List all configured alert rules across all folders |

</details>

<details>
<summary><img src="https://img.shields.io/badge/Prometheus-E6522C?logo=prometheus&logoColor=white" alt="Prometheus" height="18"> &nbsp;<strong>5 tools</strong></summary>

> Enabled when `PROMETHEUS_URL` is set.

| Tool | Description |
|------|-------------|
| `prometheus_health` | Check connectivity |
| `prometheus_query` | Instant PromQL query — current value of a metric |
| `prometheus_query_range` | Range PromQL query — metric values over time |
| `prometheus_list_metrics` | List all available metric names |
| `prometheus_metric_metadata` | Get help text and type for a specific metric |

</details>

<details>
<summary><img src="https://img.shields.io/badge/Kafka_UI-231F20?logo=apachekafka&logoColor=white" alt="Kafka UI" height="18"> &nbsp;<strong>6 tools</strong></summary>

> Enabled when `KAFKA_UI_URL` is set.

| Tool | Description |
|------|-------------|
| `kafka_list_clusters` | List configured Kafka clusters and their status |
| `kafka_list_topics` | List topics in a cluster |
| `kafka_describe_topic` | Get partition count, replication factor, and config |
| `kafka_list_consumer_groups` | List consumer groups and their state |
| `kafka_consumer_group_lag` | Get per-partition lag for a consumer group |
| `kafka_broker_health` | Broker count and disk usage per broker |

</details>

<details>
<summary><img src="https://img.shields.io/badge/Datadog-632CA6?logo=datadog&logoColor=white" alt="Datadog" height="18"> &nbsp;<strong>proxied via official server</strong></summary>

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

</details>

---

## 🔑 Getting credentials

<details>
<summary><img src="https://img.shields.io/badge/Grafana-F46800?logo=grafana&logoColor=white" alt="Grafana" height="18"> &nbsp;<strong>Service account token</strong></summary>

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
<summary><img src="https://img.shields.io/badge/Prometheus-E6522C?logo=prometheus&logoColor=white" alt="Prometheus" height="18"> &nbsp;<strong>URL (+ optional basic auth)</strong></summary>

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
<summary><img src="https://img.shields.io/badge/Kafka_UI-231F20?logo=apachekafka&logoColor=white" alt="Kafka UI" height="18"> &nbsp;<strong>URL (+ optional login)</strong></summary>

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
<summary><img src="https://img.shields.io/badge/Datadog-632CA6?logo=datadog&logoColor=white" alt="Datadog" height="18"> &nbsp;<strong>API key + Application key</strong></summary>

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

## ⚙️ Configuration

### Method A — Values directly in `.mcp.json` (simplest)

Put credentials directly in `.mcp.json`. Works everywhere, no extra steps.

Add `.mcp.json` to your `.gitignore` if the repo is shared.

<details>
<summary><strong>Method B — Keep credentials out of git</strong></summary>

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

</details>

<details>
<summary><strong>Method C — Global config (available in every project)</strong></summary>

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

</details>

---

## 📋 Environment variables

| Variable | Backend | Required | Description |
|----------|---------|:--------:|-------------|
| `GRAFANA_URL` | Grafana | ✅ | Base URL of your Grafana instance |
| `GRAFANA_TOKEN` | Grafana | ✅ | Service account token (Viewer role) |
| `GRAFANA_VERIFY_SSL` | Grafana | | Set to `false` to skip TLS verification |
| `PROMETHEUS_URL` | Prometheus | ✅ | Base URL of your Prometheus instance |
| `PROMETHEUS_USERNAME` | Prometheus | | Basic auth username |
| `PROMETHEUS_PASSWORD` | Prometheus | | Basic auth password |
| `KAFKA_UI_URL` | Kafka UI | ✅ | Base URL of your Kafka UI instance |
| `KAFKA_UI_USERNAME` | Kafka UI | | Login username |
| `KAFKA_UI_PASSWORD` | Kafka UI | | Login password |
| `DD_API_KEY` | Datadog | ✅ | Datadog API key |
| `DD_APP_KEY` | Datadog | ✅ | Datadog Application key |
| `DD_SITE` | Datadog | | Datadog site (default: `datadoghq.com`) |
| `DD_TOOLSETS` | Datadog | | Tool groups to load (default: `core,apm,alerting`) |

---

## 💬 Example prompts

### Single-backend queries

| Backend | Try asking Claude... |
|---------|---------------------|
| Grafana | *"List all datasources and tell me which ones are Prometheus type."* |
| Grafana | *"Search for dashboards related to 'kubernetes' — list names and UIDs."* |
| Grafana | *"Query `http_requests_total` rate over the last hour via the default Prometheus datasource."* |
| Prometheus | *"What is the current value of the `up` metric? Which targets are down?"* |
| Prometheus | *"Show CPU usage (`node_cpu_seconds_total` rate) over the past hour, by instance."* |
| Prometheus | *"List all available metrics that start with `http_`."* |
| Kafka UI | *"List all Kafka clusters. Are there any with offline brokers?"* |
| Kafka UI | *"Describe the topic 'orders' in cluster 'production' — partitions and replication factor?"* |
| Kafka UI | *"Check consumer lag for group 'order-processor'. Which partitions have the highest lag?"* |
| Datadog | *"List all Datadog monitors currently in Alert state."* |
| Datadog | *"Show APM service performance for the past hour. Which services have the highest error rate?"* |
| Datadog | *"Query `aws.ec2.cpuutilization` for the last 30 minutes. Which hosts are above 80%?"* |

### 🛠️ Incident Response (v0.2.0+)

| Goal | Try asking Claude... |
|------|---------------------|
| Health | *"Run a health check on all systems."* |
| Alerts | *"Are there any firing alerts in Grafana right now?"* |
| Triage | *"Show me the alert rules for the 'Production' folder."* |

### Cross-backend queries

```
Check the health of all configured observability backends and give me a summary.
```

```
I'm seeing high error rates. Check Prometheus for http_requests_total with status=500,
then look for related Datadog monitors that might be alerting.
```

---

## 🔒 Security

> [!NOTE]
> All tools are **read-only**. No write operations are performed on any backend.

> [!IMPORTANT]
> Credentials are read from environment variables and **never logged or sent to Anthropic**. Tokens are redacted in all error messages.

- TLS certificate verification is enabled by default
- The MCP process runs locally — your infrastructure URLs only reach Claude's context window if you type them into the chat

**Least-privilege recommendations:**

| Backend | Recommended role |
|---------|-----------------| 
| Grafana | Service account with **Viewer** role |
| Prometheus | Network-level read-only access |
| Kafka UI | Read-only UI user |
| Datadog | API key + Application key with read scopes |

---

## 🛠 Development

```bash
git clone https://github.com/alimuratkuslu/byok-observability-mcp
cd byok-observability-mcp
npm install
npm run dev          # run with tsx (no build step)
npm run build        # compile to dist/
npm run typecheck    # TypeScript check without emitting
```

### Tested versions

| Backend | Tested version |
|---------|---------------|
| Grafana | v9.x, v10.x, v11.x |
| Prometheus | v2.x |
| Kafka UI | `provectus/kafka-ui:v0.7.2` |

---

## License

MIT
