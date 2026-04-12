import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  GrafanaClient,
  formatGrafanaError,
  type GrafanaDataFrame,
  type GrafanaAlert,
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
  {
    name: "grafana_list_alerts",
    description:
      "List active (or filtered) alerts from Grafana Alertmanager. Supports filtering by state and label selectors. Returns alert name, state, severity, labels, annotations, and start time. Use this to answer 'are there any firing alerts right now?'",
    inputSchema: {
      type: "object",
      properties: {
        state: {
          type: "string",
          enum: ["firing", "pending", "resolved"],
          description:
            "Filter alerts by state. 'firing' = active, unsuppressed alerts. 'pending' = alerts in evaluation, not yet firing. 'resolved' = inactive alerts. Omit to get all alerts.",
        },
        labels: {
          type: "string",
          description:
            "Comma-separated label matchers to filter alerts, e.g. 'team=backend,env=prod'. Each matcher is passed as a separate Alertmanager filter param.",
        },
      },
      required: [],
    },
  },
  {
    name: "grafana_get_alert_rules",
    description:
      "List all configured Grafana alert rules from the provisioning API. Returns rule UID, title, condition, labels, annotations, folder, and rule group. Use this to see what alert rules are defined.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
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

      case "grafana_list_alerts": {
        const stateFilter = args["state"] as "firing" | "pending" | "resolved" | undefined;
        const labelsArg = args["labels"] as string | undefined;

        // Map user-facing state to Alertmanager v2 query params
        let active: boolean | undefined;
        let silenced: boolean | undefined;
        let inhibited: boolean | undefined;

        if (stateFilter === "firing") {
          active = true;
          silenced = false;
          inhibited = false;
        } else if (stateFilter === "resolved") {
          active = false;
        }
        // "pending" and undefined: fetch without boolean filters, then client-side filter

        const filter = labelsArg
          ? labelsArg.split(",").map((s) => s.trim()).filter(Boolean)
          : [];

        const allAlerts = await client.listAlerts({ active, silenced, inhibited, filter });

        // Client-side filter for "pending" (Alertmanager state: "unprocessed")
        const alerts: GrafanaAlert[] = stateFilter === "pending"
          ? allAlerts.filter((a) => a.status.state === "unprocessed")
          : allAlerts;

        const count = alerts.length;
        const stateDesc = stateFilter ? ` with state "${stateFilter}"` : "";
        return JSON.stringify({
          summary: `Found ${count} alert(s)${stateDesc} in Grafana Alertmanager.`,
          data: alerts.map((a) => ({
            name: a.labels["alertname"] ?? "(unnamed)",
            state: a.status.state,
            severity: a.labels["severity"] ?? "unknown",
            labels: a.labels,
            annotations: a.annotations,
            startsAt: a.startsAt,
            generatorURL: a.generatorURL,
            silencedBy: a.status.silencedBy,
            inhibitedBy: a.status.inhibitedBy,
          })),
          backend: "grafana",
        });
      }

      case "grafana_get_alert_rules": {
        const rules = await client.getAlertRules();
        const count = rules.length;
        const groups = [...new Set(rules.map((r) => r.ruleGroup))];
        return JSON.stringify({
          summary: `Found ${count} alert rule(s) in Grafana across ${groups.length} rule group(s).`,
          data: rules.map((r) => ({
            uid: r.uid,
            title: r.title,
            condition: r.condition,
            labels: r.labels,
            annotations: r.annotations,
            folderUID: r.folderUID,
            ruleGroup: r.ruleGroup,
            for: r.for,
            noDataState: r.noDataState,
            isPaused: r.isPaused,
            updated: r.updated,
          })),
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
