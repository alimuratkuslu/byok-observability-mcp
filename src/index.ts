#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, closeServer } from "./server.js";

async function main(): Promise<void> {
  // Interactive setup wizard
  if (process.argv.includes("--init")) {
    const { runWizard } = await import("./init.js");
    await runWizard();
    process.exit(0);
  }

  // One-shot observability report — collect data and send to Slack
  if (process.argv.includes("--report")) {
    const { runReport } = await import("./report/index.js");
    await runReport();
    process.exit(0);
  }

  const server = await createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[observability-mcp] Server started (stdio transport)\n");

  // Graceful shutdown
  const shutdown = async () => {
    await closeServer();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  process.stderr.write(`[observability-mcp] Fatal error: ${String(err)}\n`);
  process.exit(1);
});
