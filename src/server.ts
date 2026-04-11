import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { grafanaTools, handleGrafanaTool } from "./tools/grafana.js";
import { prometheusTools, handlePrometheusTool } from "./tools/prometheus.js";
import { kafkaUiTools, handleKafkaUiTool } from "./tools/kafka-ui.js";
import { loadConfig } from "./config.js";
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

  const datadogToolNames = new Set(datadogProxy.tools.map((t) => t.name));
  const allTools = [
    ...grafanaTools,
    ...prometheusTools,
    ...kafkaUiTools,
    ...datadogProxy.tools,
  ];

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
      text = await handleGrafanaTool(name, args, config);
    } else if (name.startsWith("prometheus_")) {
      text = await handlePrometheusTool(name, args, config);
    } else if (name.startsWith("kafka_")) {
      text = await handleKafkaUiTool(name, args, config);
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
