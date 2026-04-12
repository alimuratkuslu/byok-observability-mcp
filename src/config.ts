export interface GrafanaConfig {
  enabled: true;
  url: string;
  token: string;
  verifySsl: boolean;
}

export interface PrometheusConfig {
  enabled: true;
  url: string;
  username?: string;
  password?: string;
}

export interface KafkaUiConfig {
  enabled: true;
  url: string;
  username?: string;
  password?: string;
}

export interface DatadogConfig {
  enabled: true;
  apiKey: string;
  appKey: string;
  site: string;
  toolsets: string;
}

export interface Config {
  grafana: GrafanaConfig | { enabled: false };
  prometheus: PrometheusConfig | { enabled: false };
  kafkaUi: KafkaUiConfig | { enabled: false };
  datadog: DatadogConfig | { enabled: false };
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function redactSecret(value: string): string {
  if (value.length <= 6) return "[REDACTED]";
  return value.slice(0, 3) + "..." + "[REDACTED]";
}

export function loadConfig(): Config {
  const grafanaUrl = process.env["GRAFANA_URL"];
  const grafanaToken = process.env["GRAFANA_TOKEN"];
  const prometheusUrl = process.env["PROMETHEUS_URL"];
  const kafkaUiUrl = process.env["KAFKA_UI_URL"];

  let grafana: Config["grafana"] = { enabled: false };
  if (grafanaUrl) {
    if (!grafanaToken) {
      process.stderr.write(
        "[observability-mcp] GRAFANA_URL is set but GRAFANA_TOKEN is missing — Grafana tools will be unavailable.\n"
      );
    } else {
      grafana = {
        enabled: true,
        url: trimTrailingSlash(grafanaUrl),
        token: grafanaToken,
        verifySsl: process.env["GRAFANA_VERIFY_SSL"] !== "false",
      };
      if (grafana.enabled && !grafana.verifySsl) {
        process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";
        process.stderr.write(
          "[observability-mcp] WARNING: TLS certificate verification is disabled (GRAFANA_VERIFY_SSL=false).\n"
        );
      }
    }
  }

  let prometheus: Config["prometheus"] = { enabled: false };
  if (prometheusUrl) {
    prometheus = {
      enabled: true,
      url: trimTrailingSlash(prometheusUrl),
      username: process.env["PROMETHEUS_USERNAME"] || undefined,
      password: process.env["PROMETHEUS_PASSWORD"] || undefined,
    };
  }

  let kafkaUi: Config["kafkaUi"] = { enabled: false };
  if (kafkaUiUrl) {
    kafkaUi = {
      enabled: true,
      url: trimTrailingSlash(kafkaUiUrl),
      username: process.env["KAFKA_UI_USERNAME"] || undefined,
      password: process.env["KAFKA_UI_PASSWORD"] || undefined,
    };
  }

  const ddApiKey = process.env["DD_API_KEY"];
  const ddAppKey = process.env["DD_APP_KEY"];

  let datadog: Config["datadog"] = { enabled: false };
  if (ddApiKey && ddAppKey) {
    datadog = {
      enabled: true,
      apiKey: ddApiKey,
      appKey: ddAppKey,
      site: process.env["DD_SITE"] || "datadoghq.com",
      toolsets: process.env["DD_TOOLSETS"] || "core,apm,alerting",
    };
  } else if (ddApiKey || ddAppKey) {
    process.stderr.write(
      "[observability-mcp] Both DD_API_KEY and DD_APP_KEY must be set to enable Datadog tools.\n"
    );
  }

  return { grafana, prometheus, kafkaUi, datadog };
}

export interface ReportConfig {
  slackWebhookUrl: string;
  backends: string[]; // empty array = all configured backends
}

export function loadReportConfig(): ReportConfig {
  const webhookUrl = process.env["SLACK_WEBHOOK_URL"] ?? "";
  const backendsRaw = process.env["REPORT_BACKENDS"] ?? "";
  const backends = backendsRaw
    ? backendsRaw.split(",").map((b) => b.trim().toLowerCase())
    : [];
  return { slackWebhookUrl: webhookUrl, backends };
}

export function notConfiguredError(backend: string, envVar: string): string {
  return JSON.stringify({
    error: `${backend} is not configured.`,
    suggestion: `Set the ${envVar} environment variable to enable ${backend} tools.`,
  });
}
