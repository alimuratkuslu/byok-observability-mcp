import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "../config.js";
import { GrafanaClient } from "../clients/grafana.js";
import { PrometheusClient } from "../clients/prometheus.js";
import { KafkaUiClient } from "../clients/kafka-ui.js";
import type { DatadogProxy } from "../proxies/datadog.js";

export const investigateTool: Tool = {
  name: "obs_investigate_incident",
  description:
    "Meta-tool that performs parallel root cause analysis (RCA) queries across all enabled backends. Automatically checks Grafana for firing alerts, Prometheus for offline endpoints (up==0), and Kafka clusters for offline brokers.",
  inputSchema: {
    type: "object",
    properties: {}, // no arguments required, it just runs a full sweep
  },
};

export async function handleInvestigateIncident(
  config: Config,
  datadogProxy: DatadogProxy
): Promise<string> {
  const promises: Promise<string>[] = [];

  // 1. GRAFANA CHECK
  if (config.grafana.enabled) {
    promises.push(
      (async () => {
        try {
          const gfCfg = config.grafana as any;
          const client = new GrafanaClient(gfCfg.url, gfCfg.token);
          const alerts = await client.listAlerts({ active: true });
          if (alerts.length === 0) {
             return "### 📊 Grafana\n✅ No firing alerts.";
          }
          let md = `### 📊 Grafana Firing Alerts\n`;
          for (const a of alerts.slice(0, 5)) {
              const name = a.labels["alertname"] || "Unknown Alert";
              const state = a.status?.state || "active";
              md += `- **${name}** (State: ${state})\n`;
          }
          if (alerts.length > 5) md += `- ... and ${alerts.length - 5} more.\n`;
          return md;
        } catch (e: any) {
          return `### 📊 Grafana\n❌ Failed to check: ${e.message}`;
        }
      })()
    );
  }

  // 2. PROMETHEUS CHECK
  if (config.prometheus.enabled) {
    promises.push(
      (async () => {
        try {
          const prCfg = config.prometheus as any;
          const client = new PrometheusClient(prCfg.url, prCfg.username, prCfg.password);
          // Check for offline endpoints
          const upResult = await client.query("up == 0");
          let md = `### 🔥 Prometheus\n`;
          const results = upResult.data?.result || [];
          if (results.length === 0) {
             md += `✅ All tracked targets are UP.\n`;
          } else {
             md += `🚨 **Offline Targets Detected:**\n`;
             for (const r of results.slice(0, 5)) {
                 const job = r.metric.job || "unknown";
                 const instance = r.metric.instance || "unknown";
                 md += `- ${job} / ${instance} is offline.\n`;
             }
          }
          return md;
        } catch (e: any) {
          return `### 🔥 Prometheus\n❌ Failed to check: ${e.message}`;
        }
      })()
    );
  }

  // 3. KAFKA UI CHECK
  if (config.kafkaUi.enabled) {
    promises.push(
      (async () => {
        try {
          const kfCfg = config.kafkaUi as any;
          const client = new KafkaUiClient(kfCfg.url, kfCfg.username, kfCfg.password);
          const clusters = await client.listClusters();
          let md = `### 🛶 Kafka UI\n`;
          let issues = 0;
          for (const c of clusters) {
              if (c.status !== "online") {
                  issues++;
                  md += `🚨 Cluster **${c.name}** is ${c.status}.\n`;
              }
          }
          if (issues === 0) {
             md += `✅ All clusters healthy.\n`;
          }
          return md;
        } catch (e: any) {
          return `### 🛶 Kafka UI\n❌ Failed to check: ${e.message}`;
        }
      })()
    );
  }

  // 4. DATADOG
  if (datadogProxy.isConnected) {
    promises.push(Promise.resolve(`### 🐶 Datadog (Proxy)\nDatadog is active. To perform APM or Monitor checks, please explicitly call Datadog MCP tools provided in the tool list.`));
  }

  // 5. OPSGENIE
  if (config.opsgenie && config.opsgenie.enabled) {
     promises.push(Promise.resolve(`### 🛡️ OpsGenie\nOpsGenie is active. You can call \`opsgenie_list_alerts\` to check for any escalated On-Call alerts.`));
  }

  const results = await Promise.allSettled(promises);
  
  let report = "## 🕵️‍♂️ Investigation Engine (Cross-Backend RCA)\n\n";
  if (promises.length === 0) {
      report += "*No backends are configured for investigation.*";
      return report;
  }

  for (const res of results) {
     if (res.status === "fulfilled") {
         report += res.value + "\n\n";
     } else {
         report += `⚠️ Internal Error checking backend: ${res.reason}\n\n`;
     }
  }

  report += "\n**AI Instruction:** Based on the aggregated data above, please synthesize a Root Cause Analysis. If any backend indicates an issue, correlate the downtime between them.";

  return report;
}
