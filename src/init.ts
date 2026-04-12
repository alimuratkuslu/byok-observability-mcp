import prompts from "prompts";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { GrafanaClient } from "./clients/grafana.js";
import { PrometheusClient } from "./clients/prometheus.js";
import { KafkaUiClient } from "./clients/kafka-ui.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GrafanaAnswers {
  url: string;
  token: string;
  verifySsl: boolean;
}

interface PrometheusAnswers {
  url: string;
  username?: string;
  password?: string;
}

interface KafkaUiAnswers {
  url: string;
  username?: string;
  password?: string;
}

interface DatadogAnswers {
  apiKey: string;
  appKey: string;
  site: string;
  toolsets: string;
}

interface McpEnv {
  GRAFANA_URL?: string;
  GRAFANA_TOKEN?: string;
  GRAFANA_VERIFY_SSL?: string;
  PROMETHEUS_URL?: string;
  PROMETHEUS_USERNAME?: string;
  PROMETHEUS_PASSWORD?: string;
  KAFKA_UI_URL?: string;
  KAFKA_UI_USERNAME?: string;
  KAFKA_UI_PASSWORD?: string;
  DD_API_KEY?: string;
  DD_APP_KEY?: string;
  DD_SITE?: string;
  DD_TOOLSETS?: string;
}

interface McpJson {
  mcpServers: {
    "observability-mcp": {
      type: "stdio";
      command: "npx";
      args: ["-y", "byok-observability-mcp"];
      env: McpEnv;
    };
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

async function validateGrafana(cfg: GrafanaAnswers): Promise<boolean> {
  try {
    const client = new GrafanaClient(cfg.url, cfg.token);
    const health = await client.health();
    console.log(`  ✅ Grafana reachable — v${health.version} (db: ${health.database})`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ❌ Grafana connection failed: ${msg}`);
    return false;
  }
}

async function validatePrometheus(cfg: PrometheusAnswers): Promise<boolean> {
  try {
    const client = new PrometheusClient(cfg.url, cfg.username, cfg.password);
    await client.health();
    console.log("  ✅ Prometheus reachable");
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ❌ Prometheus connection failed: ${msg}`);
    return false;
  }
}

async function validateKafkaUi(cfg: KafkaUiAnswers): Promise<boolean> {
  try {
    const client = new KafkaUiClient(cfg.url, cfg.username, cfg.password);
    const clusters = await client.listClusters();
    console.log(`  ✅ Kafka UI reachable — ${clusters.length} cluster(s)`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ❌ Kafka UI connection failed: ${msg}`);
    return false;
  }
}

async function validateDatadog(cfg: DatadogAnswers): Promise<boolean> {
  try {
    const res = await fetch(`https://api.${cfg.site}/api/v1/validate`, {
      headers: { "DD-API-KEY": cfg.apiKey },
    });
    if (!res.ok) {
      console.error(`  ❌ Datadog API key invalid (HTTP ${res.status})`);
      return false;
    }
    console.log("  ✅ Datadog API key valid");
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ❌ Datadog connection failed: ${msg}`);
    return false;
  }
}

// ─── Credential collection ────────────────────────────────────────────────────

function cancelled(value: unknown): boolean {
  // prompts returns undefined or {} for critical fields when user hits Ctrl+C / ESC
  return value === undefined;
}

async function collectGrafana(): Promise<GrafanaAnswers | null> {
  console.log("\n── Grafana ──────────────────────────────────────────────");

  const r1 = await prompts(
    [
      {
        type: "text",
        name: "url",
        message: "Grafana URL",
        initial: "http://localhost:3000",
        validate: (v: string) => (v.startsWith("http") ? true : "Must start with http:// or https://"),
      },
      {
        type: "password",
        name: "token",
        message: "Service account token (glsa_...)",
        validate: (v: string) => (v.length > 0 ? true : "Token is required"),
      },
      {
        type: "confirm",
        name: "verifySsl",
        message: "Verify SSL certificates?",
        initial: true,
      },
    ],
    { onCancel: () => process.exit(0) }
  );

  if (cancelled(r1.url) || cancelled(r1.token)) return null;
  return r1 as GrafanaAnswers;
}

async function collectPrometheus(): Promise<PrometheusAnswers | null> {
  console.log("\n── Prometheus ───────────────────────────────────────────");

  const r1 = await prompts(
    {
      type: "text",
      name: "url",
      message: "Prometheus URL",
      initial: "http://localhost:9090",
      validate: (v: string) => (v.startsWith("http") ? true : "Must start with http:// or https://"),
    },
    { onCancel: () => process.exit(0) }
  );

  if (cancelled(r1.url)) return null;

  const r2 = await prompts(
    {
      type: "text",
      name: "username",
      message: "Username (leave empty to skip basic auth)",
    },
    { onCancel: () => process.exit(0) }
  );

  if (cancelled(r2.username) && r2.username !== "") return null;

  const username = (r2.username as string | undefined) || undefined;
  let password: string | undefined;

  if (username) {
    const r3 = await prompts(
      {
        type: "password",
        name: "password",
        message: "Password",
        validate: (v: string) => (v.length > 0 ? true : "Password is required when username is set"),
      },
      { onCancel: () => process.exit(0) }
    );
    if (cancelled(r3.password)) return null;
    password = r3.password as string;
  }

  return { url: r1.url as string, username, password };
}

async function collectKafkaUi(): Promise<KafkaUiAnswers | null> {
  console.log("\n── Kafka UI ──────────────────────────────────────────────");

  const r1 = await prompts(
    {
      type: "text",
      name: "url",
      message: "Kafka UI URL",
      initial: "http://localhost:8080",
      validate: (v: string) => (v.startsWith("http") ? true : "Must start with http:// or https://"),
    },
    { onCancel: () => process.exit(0) }
  );

  if (cancelled(r1.url)) return null;

  const r2 = await prompts(
    {
      type: "text",
      name: "username",
      message: "Username (leave empty to skip basic auth)",
    },
    { onCancel: () => process.exit(0) }
  );

  if (cancelled(r2.username) && r2.username !== "") return null;

  const username = (r2.username as string | undefined) || undefined;
  let password: string | undefined;

  if (username) {
    const r3 = await prompts(
      {
        type: "password",
        name: "password",
        message: "Password",
        validate: (v: string) => (v.length > 0 ? true : "Password is required when username is set"),
      },
      { onCancel: () => process.exit(0) }
    );
    if (cancelled(r3.password)) return null;
    password = r3.password as string;
  }

  return { url: r1.url as string, username, password };
}

async function collectDatadog(): Promise<DatadogAnswers | null> {
  console.log("\n── Datadog ───────────────────────────────────────────────");

  const r = await prompts(
    [
      {
        type: "password",
        name: "apiKey",
        message: "API Key",
        validate: (v: string) => (v.length > 0 ? true : "API key is required"),
      },
      {
        type: "password",
        name: "appKey",
        message: "Application Key",
        validate: (v: string) => (v.length > 0 ? true : "Application key is required"),
      },
      {
        type: "select",
        name: "site",
        message: "Datadog site",
        choices: [
          { title: "US1 — datadoghq.com", value: "datadoghq.com" },
          { title: "US3 — us3.datadoghq.com", value: "us3.datadoghq.com" },
          { title: "US5 — us5.datadoghq.com", value: "us5.datadoghq.com" },
          { title: "EU  — datadoghq.eu", value: "datadoghq.eu" },
          { title: "AP1 — ap1.datadoghq.com", value: "ap1.datadoghq.com" },
        ],
        initial: 0,
      },
      {
        type: "text",
        name: "toolsets",
        message: "Toolsets (comma-separated)",
        initial: "core,apm,alerting",
      },
    ],
    { onCancel: () => process.exit(0) }
  );

  if (cancelled(r.apiKey) || cancelled(r.appKey)) return null;
  return r as DatadogAnswers;
}

// ─── .mcp.json builder ────────────────────────────────────────────────────────

function buildMcpJson(
  grafana: GrafanaAnswers | null,
  prometheus: PrometheusAnswers | null,
  kafkaUi: KafkaUiAnswers | null,
  datadog: DatadogAnswers | null
): McpJson {
  const env: McpEnv = {};

  if (grafana) {
    env.GRAFANA_URL = grafana.url;
    env.GRAFANA_TOKEN = grafana.token;
    if (!grafana.verifySsl) env.GRAFANA_VERIFY_SSL = "false";
  }

  if (prometheus) {
    env.PROMETHEUS_URL = prometheus.url;
    if (prometheus.username) env.PROMETHEUS_USERNAME = prometheus.username;
    if (prometheus.password) env.PROMETHEUS_PASSWORD = prometheus.password;
  }

  if (kafkaUi) {
    env.KAFKA_UI_URL = kafkaUi.url;
    if (kafkaUi.username) env.KAFKA_UI_USERNAME = kafkaUi.username;
    if (kafkaUi.password) env.KAFKA_UI_PASSWORD = kafkaUi.password;
  }

  if (datadog) {
    env.DD_API_KEY = datadog.apiKey;
    env.DD_APP_KEY = datadog.appKey;
    if (datadog.site !== "datadoghq.com") env.DD_SITE = datadog.site;
    if (datadog.toolsets !== "core,apm,alerting") env.DD_TOOLSETS = datadog.toolsets;
  }

  return {
    mcpServers: {
      "observability-mcp": {
        type: "stdio",
        command: "npx",
        args: ["-y", "byok-observability-mcp"],
        env,
      },
    },
  };
}

function writeMcpJson(json: McpJson, targetPath: string): void {
  const dir = dirname(targetPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(targetPath, JSON.stringify(json, null, 2) + "\n", "utf-8");
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export async function runWizard(): Promise<void> {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║   byok-observability-mcp  —  Interactive Setup       ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log("\nThis wizard generates a .mcp.json file with your credentials.");
  console.log("No .env file is needed — all values are written inline.\n");

  // 1. Service selection
  const { services } = await prompts(
    {
      type: "multiselect",
      name: "services",
      message: "Which backends do you want to configure?",
      choices: [
        { title: "Grafana", value: "grafana", selected: false },
        { title: "Prometheus", value: "prometheus", selected: false },
        { title: "Kafka UI", value: "kafkaui", selected: false },
        { title: "Datadog", value: "datadog", selected: false },
      ],
      min: 1,
      hint: "Space to select, Enter to confirm",
    },
    { onCancel: () => process.exit(0) }
  );

  if (!services || (services as string[]).length === 0) {
    console.log("\nNo backends selected. Setup cancelled.");
    process.exit(0);
  }

  const selectedServices = services as string[];

  // 2. Collect + validate each service
  let grafana: GrafanaAnswers | null = null;
  let prometheus: PrometheusAnswers | null = null;
  let kafkaUi: KafkaUiAnswers | null = null;
  let datadog: DatadogAnswers | null = null;

  if (selectedServices.includes("grafana")) {
    const cfg = await collectGrafana();
    if (cfg) {
      console.log("\n  Checking Grafana connectivity...");
      const ok = await validateGrafana(cfg);
      if (!ok) {
        const { include } = await prompts(
          {
            type: "confirm",
            name: "include",
            message: "Include Grafana anyway?",
            initial: false,
          },
          { onCancel: () => process.exit(0) }
        );
        if (include) grafana = cfg;
      } else {
        grafana = cfg;
      }
    }
  }

  if (selectedServices.includes("prometheus")) {
    const cfg = await collectPrometheus();
    if (cfg) {
      console.log("\n  Checking Prometheus connectivity...");
      const ok = await validatePrometheus(cfg);
      if (!ok) {
        const { include } = await prompts(
          {
            type: "confirm",
            name: "include",
            message: "Include Prometheus anyway?",
            initial: false,
          },
          { onCancel: () => process.exit(0) }
        );
        if (include) prometheus = cfg;
      } else {
        prometheus = cfg;
      }
    }
  }

  if (selectedServices.includes("kafkaui")) {
    const cfg = await collectKafkaUi();
    if (cfg) {
      console.log("\n  Checking Kafka UI connectivity...");
      const ok = await validateKafkaUi(cfg);
      if (!ok) {
        const { include } = await prompts(
          {
            type: "confirm",
            name: "include",
            message: "Include Kafka UI anyway?",
            initial: false,
          },
          { onCancel: () => process.exit(0) }
        );
        if (include) kafkaUi = cfg;
      } else {
        kafkaUi = cfg;
      }
    }
  }

  if (selectedServices.includes("datadog")) {
    const cfg = await collectDatadog();
    if (cfg) {
      console.log("\n  Checking Datadog API key...");
      const ok = await validateDatadog(cfg);
      if (!ok) {
        const { include } = await prompts(
          {
            type: "confirm",
            name: "include",
            message: "Include Datadog anyway?",
            initial: false,
          },
          { onCancel: () => process.exit(0) }
        );
        if (include) datadog = cfg;
      } else {
        datadog = cfg;
      }
    }
  }

  const configured = [grafana, prometheus, kafkaUi, datadog].filter(Boolean);
  if (configured.length === 0) {
    console.log("\n⚠  No backends will be configured. Aborting.");
    process.exit(1);
  }

  // 3. Output location
  const cwdPath = join(process.cwd(), ".mcp.json");
  const claudePath = join(homedir(), ".claude", ".mcp.json");

  const { location } = await prompts(
    {
      type: "select",
      name: "location",
      message: "Where should .mcp.json be written?",
      choices: [
        { title: `Current directory  (${cwdPath})`, value: cwdPath },
        { title: `Claude config dir  (${claudePath})`, value: claudePath },
      ],
      initial: 0,
    },
    { onCancel: () => process.exit(0) }
  );

  if (!location) {
    console.log("\nSetup cancelled.");
    process.exit(0);
  }

  const targetPath = location as string;

  // 4. Overwrite check
  if (existsSync(targetPath)) {
    const { overwrite } = await prompts(
      {
        type: "confirm",
        name: "overwrite",
        message: `${targetPath} already exists. Overwrite?`,
        initial: false,
      },
      { onCancel: () => process.exit(0) }
    );
    if (!overwrite) {
      console.log("\nSetup cancelled — existing file kept.");
      process.exit(0);
    }
  }

  // 5. Write file
  const json = buildMcpJson(grafana, prometheus, kafkaUi, datadog);
  writeMcpJson(json, targetPath);

  const enabledNames: string[] = [];
  if (grafana) enabledNames.push("Grafana");
  if (prometheus) enabledNames.push("Prometheus");
  if (kafkaUi) enabledNames.push("Kafka UI");
  if (datadog) enabledNames.push("Datadog");

  console.log(`\n✅ Written: ${targetPath}`);
  console.log(`   Configured: ${enabledNames.join(", ")}`);
  console.log("\nNext step: open Claude Code and the observability tools will be available.\n");
}
