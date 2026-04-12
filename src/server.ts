import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

import { grafanaTools, handleGrafanaTool } from "./tools/grafana.js";
import { prometheusTools, handlePrometheusTool } from "./tools/prometheus.js";
import { kafkaUiTools, handleKafkaUiTool } from "./tools/kafka-ui.js";
import { loadConfig, notConfiguredError } from "./config.js";
import type { DatadogConfig } from "./config.js";
import { DatadogProxy, formatDatadogInitError } from "./proxies/datadog.js";

const config = loadConfig();
const datadogProxy = new DatadogProxy();

export async function createServer(): Promise<Server> {
  // Initialize Datadog proxy if configured (graceful degradation on failure)
  if (config.datadog.enabled) {
    const ddCfg = config.datadog as DatadogConfig;
    try {
      await datadogProxy.initialize(
        ddCfg.apiKey,
        ddCfg.appKey,
        ddCfg.site,
        ddCfg.toolsets
      );
    } catch (err) {
      const safeMsg = formatDatadogInitError(err, ddCfg.apiKey);
      process.stderr.write(
        `[observability-mcp] WARNING: Failed to connect to Datadog MCP — Datadog tools will be unavailable. Error: ${safeMsg}\n`
      );
      process.stderr.write(
        `[observability-mcp] If the Datadog MCP URL has changed, check https://docs.datadoghq.com/developers/mcp/ for updates.\n`
      );
    }
  }

  const server = new Server(
    { name: "observability-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  // Only expose tools for backends the user configured (BYOK partial setup).
  const allTools: Tool[] = [];
  if (config.grafana.enabled) allTools.push(...grafanaTools);
  if (config.prometheus.enabled) allTools.push(...prometheusTools);
  if (config.kafkaUi.enabled) allTools.push(...kafkaUiTools);
  if (datadogProxy.isConnected) allTools.push(...datadogProxy.tools);

  const datadogToolNames = datadogProxy.isConnected
    ? new Set(datadogProxy.tools.map((t) => t.name))
    : new Set<string>();

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;
    const args = (rawArgs ?? {}) as Record<string, unknown>;

    let text: string;

    if (datadogToolNames.has(name)) {
      text = await datadogProxy.callTool(name, args);
    } else if (name.startsWith("grafana_")) {
      text = config.grafana.enabled
        ? await handleGrafanaTool(name, args, config)
        : notConfiguredError("Grafana", "GRAFANA_URL and GRAFANA_TOKEN");
    } else if (name.startsWith("prometheus_")) {
      text = config.prometheus.enabled
        ? await handlePrometheusTool(name, args, config)
        : notConfiguredError("Prometheus", "PROMETHEUS_URL");
    } else if (name.startsWith("kafka_")) {
      text = config.kafkaUi.enabled
        ? await handleKafkaUiTool(name, args, config)
        : notConfiguredError("Kafka UI", "KAFKA_UI_URL");
    } else {
      text = JSON.stringify({ error: `Unknown tool: ${name}` });
    }

    return {
      content: [{ type: "text", text }],
    };
  });

  // Log which backends are enabled to stderr on startup
  const enabled: string[] = [];
  if (config.grafana.enabled) enabled.push("Grafana");
  if (config.prometheus.enabled) enabled.push("Prometheus");
  if (config.kafkaUi.enabled) enabled.push("Kafka UI");
  if (datadogProxy.isConnected) enabled.push(`Datadog (${datadogProxy.tools.length} tools)`);

  if (enabled.length === 0) {
    process.stderr.write(
      "[observability-mcp] WARNING: No backends configured. Set GRAFANA_URL, PROMETHEUS_URL, KAFKA_UI_URL, or DD_API_KEY+DD_APP_KEY to enable tools.\n"
    );
  } else {
    process.stderr.write(
      `[observability-mcp] Enabled backends: ${enabled.join(", ")}\n`
    );
  }

  return server;
}

export async function closeServer(): Promise<void> {
  await datadogProxy.close();
}
