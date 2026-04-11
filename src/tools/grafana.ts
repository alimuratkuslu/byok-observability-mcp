import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  GrafanaClient,
  formatGrafanaError,
  type GrafanaDataFrame,
} from "../clients/grafana.js";
import type { Config } from "../config.js";
import { notConfiguredError } from "../config.js";

export const grafanaTools: Tool[] = [
  {
    name: "grafana_health",
    description:
      "Check Grafana connectivity and retrieve version and database status. Use this to verify the Grafana integration is working.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "grafana_list_datasources",
    description:
      "List all datasources configured in Grafana (name, type, UID). Use this to find the UID needed for grafana_query_metrics.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "grafana_query_metrics",
    description:
      "Execute a PromQL expression via a Grafana Prometheus datasource and return the results. Use grafana_list_datasources first to find the datasource UID.",
    inputSchema: {
      type: "object",
      properties: {
        datasource_uid: {
          type: "string",
          description: "The UID of the Prometheus datasource in Grafana.",
        },
        expr: {
          type: "string",
          description: "The PromQL expression to evaluate.",
        },
        from: {
          type: "string",
          description:
            "Start of the time range, e.g. 'now-1h', 'now-30m'. Defaults to 'now-1h'.",
        },
        to: {
          type: "string",
          description:
            "End of the time range, e.g. 'now'. Defaults to 'now'.",
        },
        instant: {
          type: "boolean",
          description:
            "If true, returns a single instant value. If false, returns a time series. Defaults to true.",
        },
      },
      required: ["datasource_uid", "expr"],
    },
  },
  {
    name: "grafana_list_dashboards",
    description:
      "List dashboards in Grafana with an optional search query. Returns UID, title, folder, and tags.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Optional search string to filter dashboards by title.",
        },
      },
      required: [],
    },
  },
  {
    name: "grafana_get_dashboard",
    description:
      "Get full details of a Grafana dashboard including all panels, by its UID. Use grafana_list_dashboards to find the UID.",
    inputSchema: {
      type: "object",
      properties: {
        uid: {
          type: "string",
          description: "The UID of the dashboard.",
        },
      },
      required: ["uid"],
    },
  },
];

function parseFrameResults(
  frames: GrafanaDataFrame[]
): Array<{ labels: Record<string, string>; value: string | number }> {
  const out: Array<{ labels: Record<string, string>; value: string | number }> =
    [];
  for (const frame of frames) {
    const timeField = frame.schema.fields.find((f) => f.name === "Time");
    const valueField = frame.schema.fields.find((f) => f.name !== "Time");
    if (!valueField) continue;
    const labels = valueField.labels ?? {};
    const values = frame.data.values;
    const valueIdx = frame.schema.fields.indexOf(valueField);
    // For instant queries, just take the last value
    const rawValues = values[valueIdx];
    if (rawValues && rawValues.length > 0) {
      out.push({ labels, value: rawValues[rawValues.length - 1] });
    } else if (timeField) {
      out.push({ labels, value: "no data" });
    }
  }
  return out;
}

export async function handleGrafanaTool(
  name: string,
  args: Record<string, unknown>,
  config: Config
): Promise<string> {
  if (!config.grafana.enabled) {
    return notConfiguredError("Grafana", "GRAFANA_URL and GRAFANA_TOKEN");
  }

  const client = new GrafanaClient(config.grafana.url, config.grafana.token);

  try {
    switch (name) {
      case "grafana_health": {
        const health = await client.health();
        return JSON.stringify({
          summary: `Grafana v${health.version} is reachable. Database status: ${health.database}.`,
          data: health,
          backend: "grafana",
        });
      }

      case "grafana_list_datasources": {
        const datasources = await client.listDatasources();
        const count = datasources.length;
        const types = [...new Set(datasources.map((d) => d.type))].join(", ");
        return JSON.stringify({
          summary: `Found ${count} datasource(s) in Grafana. Types: ${types || "none"}.`,
          data: datasources.map((d) => ({
            uid: d.uid,
            name: d.name,
            type: d.type,
            isDefault: d.isDefault,
          })),
          backend: "grafana",
        });
      }

      case "grafana_query_metrics": {
        const datasourceUid = args["datasource_uid"] as string;
        const expr = args["expr"] as string;
        const from = (args["from"] as string | undefined) ?? "now-1h";
        const to = (args["to"] as string | undefined) ?? "now";
        const instant = (args["instant"] as boolean | undefined) ?? true;

        const results = await client.queryMetrics({
          datasourceUid,
          expr,
          from,
          to,
          instant,
        });

        const frameA = results["A"];
        const frames = frameA?.frames ?? [];
        const parsed = parseFrameResults(frames);
        const seriesCount = parsed.length;

        return JSON.stringify({
          summary: `PromQL query returned ${seriesCount} series for expression: ${expr}`,
          data: { expr, from, to, instant, results: parsed },
          backend: "grafana",
        });
      }

      case "grafana_list_dashboards": {
        const query = args["query"] as string | undefined;
        const dashboards = await client.listDashboards(query);
        const count = dashboards.length;
        const queryDesc = query ? ` matching "${query}"` : "";
        return JSON.stringify({
          summary: `Found ${count} dashboard(s)${queryDesc} in Grafana.`,
          data: dashboards.map((d) => ({
            uid: d.uid,
            title: d.title,
            url: d.url,
            folderTitle: d.folderTitle,
            tags: d.tags,
          })),
          backend: "grafana",
        });
      }

      case "grafana_get_dashboard": {
        const uid = args["uid"] as string;
        const dashboard = await client.getDashboard(uid);
        const panelCount = dashboard.dashboard.panels?.length ?? 0;
        return JSON.stringify({
          summary: `Dashboard "${dashboard.dashboard.title}" has ${panelCount} panel(s). Last updated: ${dashboard.meta.updated}.`,
          data: {
            uid: dashboard.dashboard.uid,
            title: dashboard.dashboard.title,
            description: dashboard.dashboard.description,
            tags: dashboard.dashboard.tags,
            folderTitle: dashboard.meta.folderTitle,
            url: dashboard.meta.url,
            updated: dashboard.meta.updated,
            panels: dashboard.dashboard.panels?.map((p) => ({
              id: p.id,
              title: p.title,
              type: p.type,
              description: p.description,
            })),
          },
          backend: "grafana",
        });
      }

      default:
        return JSON.stringify({ error: `Unknown Grafana tool: ${name}` });
    }
  } catch (err) {
    return formatGrafanaError(err);
  }
}
