# byok-observability-mcp — Setup & Usage Guide

A step-by-step guide to connecting **byok-observability-mcp** with Claude Code and using it to query Grafana, Prometheus, Kafka UI, and Datadog from your IDE.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Clone and Build](#2-clone-and-build)
3. [Getting Credentials](#3-getting-credentials)
4. [Configure Claude Code](#4-configure-claude-code)
5. [Verify the Connection](#5-verify-the-connection)
6. [Example Prompts](#6-example-prompts)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Prerequisites

Before you start, make sure you have:

- **Node.js 18 or higher** — check with `node --version`
- **Claude Code CLI** — installed and signed in (`claude --version`)
- Network access to at least one of your backends (Grafana, Prometheus, Kafka UI, or Datadog)

**Partial configuration:** Set environment variables only for the stacks you use. The server **registers MCP tools only for configured backends** (for example, Grafana-only → only `grafana_*` tools appear). You do not need Prometheus, Kafka UI, or Datadog env vars unless you want those tools. If nothing is configured, the tool list is empty until you add at least one backend.

---

## 2. Install

No clone or build step needed. The package is published to npm and runs on demand via `npx`.

**Node.js 18+** is required (check with `node --version`). npx will download and cache the package the first time it runs.

If you prefer to run from source:

```bash
git clone https://github.com/alimuratkuslu/byok-observability-mcp
cd byok-observability-mcp
npm install
npm run build
# then reference dist/index.js in the config below
```

---

## 3. Getting Credentials

Only configure the backends you actually use. Skip any section that doesn't apply.

### 3a. Grafana

You need a **service account token** with Viewer role (read-only).

1. Open Grafana → **Administration** → **Users and access** → **Service accounts**
2. Click **Add service account**
3. Set **Role** to `Viewer`, give it a name (e.g. `claude-code-readonly`), and click **Create**
4. On the service account page, click **Add service account token**
5. Set an expiry if desired, then click **Generate token**
6. Copy the token — it starts with `glsa_` — you won't see it again

You also need the base URL of your Grafana instance, e.g. `https://grafana.myco.internal`.

```
GRAFANA_URL=https://grafana.myco.internal
GRAFANA_TOKEN=glsa_xxxxxxxxxxxxxxxx
```

> **Note:** If your Grafana uses a self-signed certificate, add `GRAFANA_VERIFY_SSL=false`.

---

### 3b. Prometheus

Prometheus is often accessible without authentication if it's behind a VPN or internal network.

If your Prometheus has **basic auth** configured:

```
PROMETHEUS_URL=https://prometheus.myco.internal
PROMETHEUS_USERNAME=your-username
PROMETHEUS_PASSWORD=your-password
```

If there's no auth:

```
PROMETHEUS_URL=https://prometheus.myco.internal
```

---

### 3c. Kafka UI

Kafka UI (provectus/kafka-ui) uses a username and password for its web login.

```
KAFKA_UI_URL=https://kafka-ui.myco.internal
KAFKA_UI_USERNAME=admin
KAFKA_UI_PASSWORD=your-password
```

If your Kafka UI is running without authentication:

```
KAFKA_UI_URL=https://kafka-ui.myco.internal
```

---

### 3d. Datadog

You need two separate keys — an API key and an Application key.

**Create an API key:**
1. Go to Datadog → **Organization Settings** → **API Keys**
2. Click **New Key**, give it a name, and copy the key value

**Create an Application key:**
1. Go to Datadog → **Organization Settings** → **Application Keys**
2. Click **New Key**, give it a name, and copy the key value

**Determine your DD_SITE:**

| Region | DD_SITE value |
|--------|--------------|
| US1 (default) | `datadoghq.com` |
| US3 | `us3.datadoghq.com` |
| US5 | `us5.datadoghq.com` |
| EU1 | `datadoghq.eu` |
| AP1 | `ap1.datadoghq.com` |

If you log in at `app.datadoghq.com`, your site is `datadoghq.com`. If you log in at `app.us3.datadoghq.com`, your site is `us3.datadoghq.com`.

```
DD_API_KEY=your-datadog-api-key
DD_APP_KEY=your-datadog-application-key
DD_SITE=datadoghq.com
DD_TOOLSETS=core,apm,alerting
```

**DD_TOOLSETS** controls which Datadog tool groups load. Default is `core,apm,alerting`. Available groups:

| Toolset | What it covers |
|---------|---------------|
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

Use `DD_TOOLSETS=all` to load all available Datadog tools.

---

## 4. Configure Claude Code

### Method A0 (simplest): `.env` + one `mcp add` — no secrets in the command

Use this if your Claude Code version **passes the parent process environment** to the MCP subprocess (common when you start `claude` from a terminal).

1. In your **project directory**:

   ```bash
   curl -sO https://raw.githubusercontent.com/alimuratkuslu/byok-observability-mcp/main/.env.example
   cp .env.example .env
   ```

   Edit **`.env`** with your URLs and tokens. Never commit `.env`.

2. Register the MCP **once** (no `--env`, no keys on this line):

   ```bash
   claude mcp add --transport stdio observability-mcp --scope project -- npx -y byok-observability-mcp
   ```

3. **Every time** you open Claude Code for this project, load `.env` first, then start Claude:

   ```bash
   set -a && source .env && set +a && claude
   ```

If tools return “not configured” even though `.env` is correct, your client may not inherit env for MCP — use **Method A1**.

---

### Method A1: `.mcp.json` + `${VAR}` (when env inheritance is not enough)

1. Copy both example files into the project root:

   ```bash
   curl -sO https://raw.githubusercontent.com/alimuratkuslu/byok-observability-mcp/main/.mcp.json.example
   curl -sO https://raw.githubusercontent.com/alimuratkuslu/byok-observability-mcp/main/.env.example
   mv .mcp.json.example .mcp.json
   cp .env.example .env
   ```

   From npm: `cp node_modules/byok-observability-mcp/.mcp.json.example .mcp.json` (and `.env.example` → `.env`).

2. Edit **`.env`** only.

3. Run the same one-line add as A0 (still no secrets in the command):

   ```bash
   claude mcp add --transport stdio observability-mcp --scope project -- npx -y byok-observability-mcp
   ```

4. If `claude mcp add` **overwrote** `.mcp.json`, open `.mcp.json` and **merge** the `"env": { … "${VAR}" … }` block from [`.mcp.json.example`](./.mcp.json.example) into the `observability-mcp` server entry (or replace the server entry with the example).

5. Start Claude with `.env` loaded so `${VAR}` expands:

   ```bash
   set -a && source .env && set +a && claude
   ```

   Or, from a clone of this repo: `./scripts/run-claude-with-env.sh`

**Why A1:** `.mcp.json` lists `GRAFANA_URL: "${GRAFANA_URL}"` etc. Values stay in `.gitignore`d `.env`; nothing secret is in the `claude mcp add` line.

---

### Method B: all credentials inline (not recommended)

Only if you accept secrets in shell history / config files:

```bash
claude mcp add --transport stdio observability-mcp \
  --env GRAFANA_URL="https://grafana.myco.internal" \
  --env GRAFANA_TOKEN="glsa_..." \
  ... \
  -- npx -y byok-observability-mcp
```

---

### Method C: global `~/.claude.json` with literal env values

Open `~/.claude.json` and add `mcpServers` (same shape as `.mcp.json.example` but with **literal** strings instead of `${VAR}`). Remove any keys you don't need.

**Running from source?** Replace `command` / `args` with:

```json
"command": "node",
"args": ["/absolute/path/to/byok-observability-mcp/dist/index.js"]
```

---

## 5. Verify the Connection

After saving the config, start a new Claude Code session and run the following verification prompts. Each one exercises a different backend.

### Check Grafana

```
Run grafana_health and tell me the Grafana version and database status.
```

Expected: Grafana version number and `"database": "ok"`.

### Check Prometheus

```
Run prometheus_health and confirm Prometheus is reachable.
```

Expected: confirmation that Prometheus responded with a healthy status.

### Check Kafka UI

```
Run kafka_list_clusters and show me all configured Kafka clusters.
```

Expected: list of cluster names with broker counts and statuses.

### Check Datadog

```
Use the Datadog tools to list available monitors.
```

Expected: list of Datadog monitors (requires `alerting` or `core` toolset).

### List all tools

```
What observability tools do you have available?
```

Expected: Claude lists all tools from Grafana, Prometheus, Kafka UI, and Datadog — typically 30+ tools total when all backends are configured.

---

## 6. Example Prompts

Copy and paste these prompts directly into Claude Code.

### Grafana

```
List all Grafana datasources and tell me which ones are Prometheus type.
```

```
Query the metric 'http_requests_total' in Grafana using the default Prometheus datasource. Show me the rate over the last hour.
```

```
Search for dashboards related to "kubernetes" in Grafana and list their names and UIDs.
```

```
Get the dashboard with UID "abc123" and describe what panels it contains.
```

### Prometheus

```
What is the current value of the 'up' metric? Which targets are down?
```

```
Show me the CPU usage (rate of node_cpu_seconds_total) over the past hour, broken down by instance.
```

```
List all available metrics that start with 'http_'.
```

```
What does the metric 'process_resident_memory_bytes' measure? What type is it?
```

### Kafka UI

```
List all Kafka clusters and tell me which ones have any offline brokers.
```

```
List topics in the 'production' cluster. Are there any topics with under-replicated partitions?
```

```
Describe the topic 'orders' in cluster 'production'. How many partitions does it have and what is the replication factor?
```

```
List consumer groups in the 'production' cluster and show me which ones are not in Stable state.
```

```
Check consumer lag for group 'order-processor' in cluster 'production'. Which partitions have the highest lag?
```

```
Get broker health for the 'production' cluster. How much disk space is each broker using?
```

### Datadog

```
List all Datadog monitors that are currently in Alert state.
```

```
Show me APM service performance metrics for the past hour. Which services have the highest error rate?
```

```
Are there any open Datadog incidents right now? Show me their severity and status.
```

```
Query the metric 'aws.ec2.cpuutilization' in Datadog for the last 30 minutes. Which hosts are above 80%?
```

### Cross-backend

```
Check the health of all configured observability backends and give me a summary of which ones are reachable.
```

```
I'm seeing high error rates in my application. Check Prometheus for http_requests_total with status=500, then look for related Datadog monitors that might be alerting.
```

---

## 7. Troubleshooting

### "not configured" message instead of tool results

**Cause:** The backend's URL environment variable isn't set.

**Fix:** Check that the env var is in your `mcpServers` config in `~/.claude.json`. Verify there are no typos in variable names (`GRAFANA_URL`, not `GRAFANA-URL`).

---

### Grafana: "Auth failed" or 401 error

**Cause:** The service account token is invalid or expired.

**Fix:**
1. Go to Grafana → Administration → Service accounts
2. Check if the token has expired (service account tokens can have expiry dates)
3. Generate a new token and update `GRAFANA_TOKEN` in your config

---

### Grafana: "Cannot reach Grafana" error

**Cause:** The `GRAFANA_URL` is unreachable from your machine.

**Fix:**
- Check if you need to be on VPN
- Try `curl https://grafana.myco.internal/api/health` in your terminal
- If using a self-signed certificate, add `GRAFANA_VERIFY_SSL=false` to your config

---

### Prometheus: Connection refused or timeout

**Cause:** Prometheus isn't reachable, or the URL is wrong.

**Fix:**
- Try `curl https://prometheus.myco.internal/-/healthy` in your terminal
- If you get a 401, set `PROMETHEUS_USERNAME` and `PROMETHEUS_PASSWORD`

---

### Kafka UI: 401 or login redirect

**Cause:** Kafka UI requires basic auth credentials.

**Fix:** Set `KAFKA_UI_USERNAME` and `KAFKA_UI_PASSWORD` in your config.

---

### Datadog: "Failed to connect" warning at startup

**Cause:** API key or Application key is invalid, or `DD_SITE` doesn't match your Datadog region.

**Fix:**
1. Verify both `DD_API_KEY` and `DD_APP_KEY` are set
2. Check your Datadog site — if you log in at `app.us3.datadoghq.com`, set `DD_SITE=us3.datadoghq.com`
3. Make sure the API key is from **Organization Settings → API Keys**, not from an integration
4. Make sure the Application key has sufficient scope (read permissions)

If the Datadog MCP URL has changed, check the [official Datadog MCP documentation](https://docs.datadoghq.com/developers/mcp/).

---

### No tools appear in Claude Code

**Cause:** The MCP server failed to start, or the config path is wrong.

**Fix:**
1. Check that the path in `args` points to the built file: `/path/to/observability-mcp/dist/index.js`
2. Run the server manually to see startup errors: `node /path/to/observability-mcp/dist/index.js`
3. Confirm Claude Code picked up the config: restart Claude Code after editing `~/.claude.json`

---

### Tools appear but all return errors

**Cause:** MCP server started but all env vars are missing (the server falls back to "not configured" for every tool).

**Fix:** Verify the `env` block in your `~/.claude.json` has the correct values — Claude Code passes these to the MCP process at startup.

---

## Security Notes

- Credentials are read from environment variables and never logged or transmitted to Anthropic
- Your infrastructure URLs are only sent to the Claude API if you paste them into the chat
- All tools are **read-only** — no write operations are performed on any backend
- Use the least-privilege roles described in the README (Grafana Viewer, Prometheus read-only, Kafka UI read-only user)
