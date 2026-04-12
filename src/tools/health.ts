import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "../config.js";
import type { GrafanaConfig } from "../config.js";
import type { PrometheusConfig } from "../config.js";
import type { KafkaUiConfig } from "../config.js";
import { GrafanaClient } from "../clients/grafana.js";
import { PrometheusClient } from "../clients/prometheus.js";
import { KafkaUiClient } from "../clients/kafka-ui.js";
import type { DatadogProxy } from "../proxies/datadog.js";

export const healthCheckTool: Tool = {
  name: "obs_health_check",
  description:
    "Run a health check across all configured observability backends (Grafana, Prometheus, Kafka UI, Datadog) in parallel and return a status summary table. Use this to answer 'are all systems up?'",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
};

interface BackendStatus {
  name: string;
  statusIcon: string;
  details: string;
}

// ✅ (U+2705) and ❌ (U+274C) are single code points but render as 2 columns wide.
function visualWidth(s: string): number {
  const doubleWidthChars = (s.match(/[\u2705\u274C]/g) ?? []).length;
  return s.length + doubleWidthChars;
}

function padRight(s: string, targetVisualWidth: number): string {
  const spaces = Math.max(0, targetVisualWidth - visualWidth(s));
  return s + " ".repeat(spaces);
}

function renderTable(rows: BackendStatus[]): string {
  const header = { name: "Backend", statusIcon: "Status", details: "Details" };
  const allRows = [header, ...rows];

  const w0 = Math.max(...allRows.map((r) => visualWidth(r.name)));
  const w1 = Math.max(...allRows.map((r) => visualWidth(r.statusIcon)));
  const w2 = Math.max(...allRows.map((r) => visualWidth(r.details)));

  const hLine = (l: string, m: string, r: string): string =>
    l + "─".repeat(w0 + 2) + m + "─".repeat(w1 + 2) + m + "─".repeat(w2 + 2) + r;

  const row = (r: BackendStatus): string =>
    "│ " +
    padRight(r.name, w0) +
    " │ " +
    padRight(r.statusIcon, w1) +
    " │ " +
    padRight(r.details, w2) +
    " │";

  const lines: string[] = [
    hLine("┌", "┬", "┐"),
    row(header),
    hLine("├", "┼", "┤"),
    ...rows.map(row),
    hLine("└", "┴", "┘"),
  ];

  return lines.join("\n");
}

async function checkGrafana(config: Config): Promise<BackendStatus> {
  if (!config.grafana.enabled) {
    return { name: "Grafana", statusIcon: "❌ OFF", details: "Not configured" };
  }
  const cfg = config.grafana as GrafanaConfig;
  try {
    const client = new GrafanaClient(cfg.url, cfg.token);
    const health = await client.health();
    return { name: "Grafana", statusIcon: "✅ UP", details: `v${health.version}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const short = msg.length > 30 ? msg.slice(0, 27) + "..." : msg;
    return { name: "Grafana", statusIcon: "❌ DOWN", details: short };
  }
}

async function checkPrometheus(config: Config): Promise<BackendStatus> {
  if (!config.prometheus.enabled) {
    return { name: "Prometheus", statusIcon: "❌ OFF", details: "Not configured" };
  }
  const cfg = config.prometheus as PrometheusConfig;
  try {
    const client = new PrometheusClient(cfg.url, cfg.username, cfg.password);
    const healthy = await client.health();
    return {
      name: "Prometheus",
      statusIcon: "✅ UP",
      details: `healthy: ${healthy}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const short = msg.length > 30 ? msg.slice(0, 27) + "..." : msg;
    return { name: "Prometheus", statusIcon: "❌ DOWN", details: short };
  }
}

async function checkKafkaUi(config: Config): Promise<BackendStatus> {
  if (!config.kafkaUi.enabled) {
    return { name: "Kafka UI", statusIcon: "❌ OFF", details: "Not configured" };
  }
  const cfg = config.kafkaUi as KafkaUiConfig;
  try {
    const client = new KafkaUiClient(cfg.url, cfg.username, cfg.password);
    const clusters = await client.listClusters();
    return {
      name: "Kafka UI",
      statusIcon: "✅ UP",
      details: `${clusters.length} cluster${clusters.length !== 1 ? "s" : ""}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const short = msg.length > 30 ? msg.slice(0, 27) + "..." : msg;
    return { name: "Kafka UI", statusIcon: "❌ DOWN", details: short };
  }
}

function checkDatadog(proxy: DatadogProxy, config: Config): BackendStatus {
  if (proxy.isConnected) {
    return {
      name: "Datadog",
      statusIcon: "✅ CONNECTED",
      details: `${proxy.tools.length} tools`,
    };
  }
  if (config.datadog.enabled) {
    return { name: "Datadog", statusIcon: "❌ DOWN", details: "Connection failed" };
  }
  return { name: "Datadog", statusIcon: "❌ OFF", details: "Not configured" };
}

export async function handleHealthCheck(
  config: Config,
  datadogProxy: DatadogProxy
): Promise<string> {
  const backendNames = ["Grafana", "Prometheus", "Kafka UI", "Datadog"];

  const settled = await Promise.allSettled([
    checkGrafana(config),
    checkPrometheus(config),
    checkKafkaUi(config),
    Promise.resolve(checkDatadog(datadogProxy, config)),
  ]);

  const rows: BackendStatus[] = settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
    return { name: backendNames[i]!, statusIcon: "❌ DOWN", details: msg.slice(0, 30) };
  });

  const upCount = rows.filter((r) => r.statusIcon.startsWith("✅")).length;
  const total = rows.length;
  const table = renderTable(rows);

  return JSON.stringify({
    summary: `Health check complete: ${upCount}/${total} backends reachable.`,
    data: rows,
    table,
    backend: "meta",
  });
}
