import { ReportItem, Severity } from "./categorizer.js";

const SEVERITY_EMOJI: Record<Severity, string> = {
  P0: "🔴",
  P1: "🟠",
  P2: "🟡",
  P3: "🟢",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  P0: "P0 — CRITICAL",
  P1: "P1 — HIGH",
  P2: "P2 — MEDIUM",
  P3: "P3 — INFO",
};

export function formatSlackMessage(
  items: ReportItem[],
  timestamp: string
): object {
  const actionableItems = items.filter((i) => i.severity !== "P3");
  const hasIssues = actionableItems.length > 0;

  const blocks: object[] = [];

  // Header
  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: hasIssues
        ? `⚠️ Observability Report — ${actionableItems.length} issue(s) detected`
        : "✅ Observability Report — All systems normal",
      emoji: true,
    },
  });

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Report time: ${new Date(timestamp).toUTCString()}`,
      },
    ],
  });

  blocks.push({ type: "divider" });

  if (!hasIssues) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "No issues detected. All systems are operating as expected.",
      },
    });
  } else {
    const severityGroups: Severity[] = ["P0", "P1", "P2"];
    for (const sev of severityGroups) {
      const sevItems = items.filter((i) => i.severity === sev);
      if (sevItems.length === 0) continue;

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${SEVERITY_EMOJI[sev]} ${SEVERITY_LABEL[sev]}* (${sevItems.length} issue(s))`,
        },
      });

      const lines = sevItems
        .map((item) => {
          const detail = item.detail ? ` — _${item.detail}_` : "";
          return `• *${item.backend}:* ${item.message}${detail}`;
        })
        .join("\n");

      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: lines },
      });
    }
  }

  // P3 info as a compact context block
  const p3Items = items.filter((i) => i.severity === "P3");
  if (p3Items.length > 0) {
    blocks.push({ type: "divider" });
    const p3Lines = p3Items
      .map((item) => `${SEVERITY_EMOJI["P3"]} *${item.backend}:* ${item.message}`)
      .join("\n");
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `*P3 — INFO*\n${p3Lines}`,
        },
      ],
    });
  }

  return { blocks };
}
