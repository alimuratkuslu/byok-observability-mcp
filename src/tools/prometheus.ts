import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  PrometheusClient,
  formatPrometheusError,
  formatInstantResults,
  formatRangeResults,
} from "../clients/prometheus.js";
import type { Config, PrometheusConfig } from "../config.js";
import { notConfiguredError } from "../config.js";

export const prometheusTools: Tool[] = [
  {
    name: "prometheus_health",
    description:
      "Check Prometheus connectivity. Returns healthy/unhealthy status.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "prometheus_query",
    description:
      "Execute an instant PromQL query and return the current value(s). Best for checking current state of a metric (e.g. CPU usage right now).",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The PromQL expression to evaluate.",
        },
        time: {
          type: "string",
          description:
            "Evaluation timestamp as RFC3339 or Unix timestamp. Defaults to current time.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "prometheus_query_range",
    description:
      "Execute a PromQL range query and return a time series. Use this to see how a metric changed over time.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The PromQL expression to evaluate.",
        },
        start: {
          type: "string",
          description:
            "Start time as RFC3339 or Unix timestamp. Defaults to 1 hour ago.",
        },
        end: {
          type: "string",
          description:
            "End time as RFC3339 or Unix timestamp. Defaults to now.",
        },
        step: {
          type: "string",
          description:
            "Query resolution step, e.g. '60s', '5m', '1h'. Defaults to '60s'.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "prometheus_list_metrics",
    description:
      "List all available metric names in Prometheus. Useful for discovery when you don't know the exact metric name.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "prometheus_metric_metadata",
    description:
      "Get help text, type, and unit for a specific Prometheus metric. Omit metric_name to list all metadata.",
    inputSchema: {
      type: "object",
      properties: {
        metric_name: {
          type: "string",
          description:
            "The metric name to look up. Omit to retrieve metadata for all metrics.",
        },
      },
      required: [],
    },
  },
];

function nowUnix(): string {
  return String(Math.floor(Date.now() / 1000));
}

function oneHourAgoUnix(): string {
  return String(Math.floor(Date.now() / 1000) - 3600);
}

export async function handlePrometheusTool(
  name: string,
  args: Record<string, unknown>,
  config: Config
): Promise<string> {
  if (!config.prometheus.enabled) {
    return notConfiguredError("Prometheus", "PROMETHEUS_URL");
  }

  const cfg = config.prometheus as PrometheusConfig;
  const client = new PrometheusClient(cfg.url, cfg.username, cfg.password);

  try {
    switch (name) {
      case "prometheus_health": {
        const healthy = await client.health();
        return JSON.stringify({
          summary: healthy
            ? "Prometheus is reachable and healthy."
            : "Prometheus responded but did not report healthy.",
          data: { healthy },
          backend: "prometheus",
        });
      }

      case "prometheus_query": {
        const query = args["query"] as string;
        const time = args["time"] as string | undefined;
        const response = await client.query(query, time);

        if (response.status === "error") {
          return JSON.stringify({
            error: `Prometheus query error: ${response.error}`,
            errorType: response.errorType,
          });
        }

        const results = formatInstantResults(
          response.data.result as Parameters<typeof formatInstantResults>[0]
        );
        const count = results.length;
        return JSON.stringify({
          summary: `Instant query returned ${count} series. Expression: ${query}`,
          data: { query, resultType: response.data.resultType, results },
          backend: "prometheus",
        });
      }

      case "prometheus_query_range": {
        const query = args["query"] as string;
        const start = (args["start"] as string | undefined) ?? oneHourAgoUnix();
        const end = (args["end"] as string | undefined) ?? nowUnix();
        const step = (args["step"] as string | undefined) ?? "60s";

        const response = await client.queryRange(query, start, end, step);

        if (response.status === "error") {
          return JSON.stringify({
            error: `Prometheus range query error: ${response.error}`,
            errorType: response.errorType,
          });
        }

        const results = formatRangeResults(
          response.data.result as Parameters<typeof formatRangeResults>[0]
        );
        const seriesCount = results.length;
        const pointCount = results.reduce((n, r) => n + r.values.length, 0);
        return JSON.stringify({
          summary: `Range query returned ${seriesCount} series with ${pointCount} total data points. Expression: ${query}`,
          data: { query, start, end, step, resultType: response.data.resultType, results },
          backend: "prometheus",
        });
      }

      case "prometheus_list_metrics": {
        const metrics = await client.listMetrics();
        const count = metrics.length;
        return JSON.stringify({
          summary: `Found ${count} metric(s) in Prometheus.`,
          data: { count, metrics },
          backend: "prometheus",
        });
      }

      case "prometheus_metric_metadata": {
        const metricName = args["metric_name"] as string | undefined;
        const metadata = await client.metricMetadata(metricName);
        const keys = Object.keys(metadata);
        const desc = metricName
          ? `for metric "${metricName}"`
          : `across ${keys.length} metric(s)`;
        return JSON.stringify({
          summary: `Retrieved metadata ${desc}.`,
          data: { metadata },
          backend: "prometheus",
        });
      }

      default:
        return JSON.stringify({ error: `Unknown Prometheus tool: ${name}` });
    }
  } catch (err) {
    return formatPrometheusError(err);
  }
}
