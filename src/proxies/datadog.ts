import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { redactSecret } from "../config.js";

const DATADOG_MCP_URL = "https://mcp.datadoghq.com/api/unstable/mcp-server/mcp";

export class DatadogProxy {
  private client: Client;
  private cachedTools: Tool[] = [];
  private connected = false;

  constructor() {
    this.client = new Client(
      { name: "observability-mcp-datadog-proxy", version: "0.1.0" },
      { capabilities: {} }
    );
  }

  async initialize(
    apiKey: string,
    appKey: string,
    site: string,
    toolsets: string
  ): Promise<void> {
    const baseUrl = site === "datadoghq.com"
      ? DATADOG_MCP_URL
      : DATADOG_MCP_URL.replace("mcp.datadoghq.com", `mcp.${site}`);

    const url = new URL(baseUrl);
    url.searchParams.set("toolsets", toolsets);

    process.stderr.write(
      `[observability-mcp] Connecting to Datadog MCP at ${url.origin}${url.pathname}?toolsets=${toolsets}\n`
    );

    const transport = new StreamableHTTPClientTransport(url, {
      requestInit: {
        headers: {
          "DD-API-KEY": apiKey,
          "DD-APPLICATION-KEY": appKey,
        },
      },
    });

    await this.client.connect(transport);

    const result = await this.client.listTools();
    this.cachedTools = result.tools;
    this.connected = true;

    process.stderr.write(
      `[observability-mcp] Datadog: connected, ${this.cachedTools.length} tool(s) available.\n`
    );
  }

  get tools(): Tool[] {
    return this.cachedTools;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (!this.connected) {
      return JSON.stringify({
        error: "Datadog proxy is not connected.",
        suggestion: "Check DD_API_KEY and DD_APP_KEY environment variables.",
      });
    }

    const result = await this.client.callTool({ name, arguments: args });

    // Serialize the content array to a single text string
    const content = result.content;
    if (!Array.isArray(content) || content.length === 0) {
      return JSON.stringify({ data: null, backend: "datadog" });
    }

    // If there's a single text block, return it directly (may already be JSON)
    if (content.length === 1 && content[0]?.type === "text") {
      return (content[0] as { type: "text"; text: string }).text;
    }

    // Multiple blocks — join text blocks, skip others
    const text = content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n");

    return text || JSON.stringify({ data: content, backend: "datadog" });
  }

  async close(): Promise<void> {
    if (this.connected) {
      try {
        await this.client.close();
      } catch {
        // ignore close errors
      }
      this.connected = false;
    }
  }
}

export function formatDatadogInitError(err: unknown, apiKey: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  const redacted = redactSecret(apiKey);
  return msg.replace(apiKey, redacted);
}
