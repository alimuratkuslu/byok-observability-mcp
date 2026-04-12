import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { OpsGenieClient } from "../clients/opsgenie.js";
import type { Config } from "../config.js";

export const opsgenieTools: Tool[] = [
  {
    name: "opsgenie_list_alerts",
    description: "List currently open OpsGenie alerts. Returns ID, tinyId, message, priority, and acknowledged status.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Max number of alerts to return (default 20, max 100).",
        },
      },
    },
  },
  {
    name: "opsgenie_who_is_on_call",
    description: "List current on-call participants for all schedules. Helps you find who to page.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "opsgenie_ack_alert",
    description: "Acknowledge an open OpsGenie alert to prevent escalations.",
    inputSchema: {
      type: "object",
      properties: {
        alert_id: {
          type: "string",
          description: "The full ID of the alert to acknowledge.",
        },
      },
      required: ["alert_id"],
    },
  },
];

export async function handleOpsgenieTool(
  name: string,
  args: Record<string, unknown>,
  config: Config
): Promise<string> {
  const opsgenieConfig = config.opsgenie;
  if (!opsgenieConfig || !opsgenieConfig.enabled) {
    throw new Error("OpsGenie is not configured.");
  }

  const client = new OpsGenieClient(opsgenieConfig);

  try {
    switch (name) {
      case "opsgenie_list_alerts": {
        const limit = typeof args.limit === "number" ? args.limit : 20;
        const alerts = await client.getOpenAlerts(limit);

        if (alerts.length === 0) return "No open alerts found in OpsGenie.";

        let md = "### 🚨 Open OpsGenie Alerts\n\n";
        md += "| Tiny ID | Priority | Ack | Message | Full ID |\n";
        md += "|---|---|---|---|---|\n";

        for (const a of alerts) {
           const ackIcon = a.acknowledged ? "✅" : "❌";
           md += `| \`${a.tinyId}\` | ${a.priority} | ${ackIcon} | ${a.message} | \`${a.id}\` |\n`;
        }

        return md;
      }

      case "opsgenie_who_is_on_call": {
        const schedules = await client.getSchedules();
        if (schedules.length === 0) return "No schedules found in OpsGenie.";

        let md = "### 🧑‍💻 OpsGenie On-Call Status\n\n";

        for (const schedule of schedules) {
          try {
             const onCallObj = await client.getOnCall(schedule.id);
             // handle loose onCall API payload based on v2 typical structure
             const participants = (onCallObj as any)?._parent?.onCallParticipants || (onCallObj as any)?.onCallParticipants || [];
             
             const names = participants.map((p: any) => p.name || p.username).join(", ");
             md += `- **${schedule.name}**: ${names ? names : "*Nobody currently on call*"}\n`;
          } catch (e) {
             md += `- **${schedule.name}**: *(Failed to fetch on-call info)*\n`;
          }
        }
        return md;
      }

      case "opsgenie_ack_alert": {
        const alertId = String(args.alert_id);
        if (!alertId) return JSON.stringify({ error: "alert_id is REQUIRED." });

        if (!opsgenieConfig.allowWrite) {
          return JSON.stringify({
             error: "Acknowledging alerts is disabled. Start the server with OPSGENIE_ALLOW_WRITE=true to enable write operations."
          });
        }

        await client.acknowledgeAlert(alertId);
        return `✅ Successfully acknowledged alert: \`${alertId}\``;
      }

      default:
        return JSON.stringify({ error: `Unknown opsgenie tool: ${name}` });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `OpsGenie operation failed: ${msg}` });
  }
}
