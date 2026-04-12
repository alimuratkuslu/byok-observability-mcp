import { loadConfig, loadReportConfig } from "../config.js";
import { collectData } from "./collector.js";
import { categorize } from "./categorizer.js";
import { formatSlackMessage } from "./formatter.js";
import { sendSlackMessage } from "./slack.js";

export async function runReport(): Promise<void> {
  const config = loadConfig();
  const reportConfig = loadReportConfig();

  if (!reportConfig.slackWebhookUrl) {
    process.stderr.write(
      "[observability-mcp] SLACK_WEBHOOK_URL is not set. Cannot send report.\n" +
        "  Set SLACK_WEBHOOK_URL to your Slack Incoming Webhook URL.\n"
    );
    process.exit(1);
  }

  process.stderr.write("[observability-mcp] Collecting observability data...\n");
  const data = await collectData(config, reportConfig.backends);

  process.stderr.write("[observability-mcp] Categorizing findings...\n");
  const items = categorize(data);

  const payload = formatSlackMessage(items, data.timestamp);

  process.stderr.write("[observability-mcp] Sending report to Slack...\n");
  await sendSlackMessage(reportConfig.slackWebhookUrl, payload);

  const p0 = items.filter((i) => i.severity === "P0").length;
  const p1 = items.filter((i) => i.severity === "P1").length;
  const p2 = items.filter((i) => i.severity === "P2").length;
  process.stderr.write(
    `[observability-mcp] Report sent successfully. P0: ${p0}, P1: ${p1}, P2: ${p2}\n`
  );
}
