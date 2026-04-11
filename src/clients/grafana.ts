import { redactSecret } from "../config.js";

export interface GrafanaDatasource {
  id: number;
  uid: string;
  name: string;
  type: string;
  url: string;
  access: string;
  isDefault: boolean;
}

export interface GrafanaDashboardSummary {
  id: number;
  uid: string;
  title: string;
  url: string;
  folderTitle?: string;
  tags: string[];
  type: string;
}

export interface GrafanaDashboard {
  meta: {
    slug: string;
    url: string;
    folderTitle?: string;
    created: string;
    updated: string;
  };
  dashboard: {
    uid: string;
    title: string;
    description?: string;
    tags: string[];
    panels: GrafanaPanel[];
    time?: { from: string; to: string };
  };
}

export interface GrafanaPanel {
  id: number;
  title: string;
  type: string;
  description?: string;
}

export interface GrafanaHealth {
  commit: string;
  database: string;
  version: string;
}

export interface GrafanaQueryResult {
  refId: string;
  frames: GrafanaDataFrame[];
}

export interface GrafanaDataFrame {
  schema: {
    fields: Array<{
      name: string;
      type: string;
      labels?: Record<string, string>;
    }>;
  };
  data: {
    values: Array<number[]>;
  };
}

class GrafanaError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "GrafanaError";
  }
}

export class GrafanaClient {
  private headers: Record<string, string>;

  constructor(
    private baseUrl: string,
    token: string
  ) {
    this.headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers: { ...this.headers, ...(options.headers as Record<string, string> ?? {}) },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new GrafanaError(0, `Cannot reach Grafana at ${path}: ${msg}`);
    }

    if (!response.ok) {
      let detail = "";
      try {
        const body = (await response.json()) as { message?: string };
        detail = body.message ?? "";
      } catch {
        // ignore parse errors
      }
      throw new GrafanaError(
        response.status,
        `Grafana returned ${response.status} for ${path}${detail ? ": " + detail : ""}`
      );
    }

    return response.json() as Promise<T>;
  }

  async health(): Promise<GrafanaHealth> {
    return this.request<GrafanaHealth>("/api/health");
  }

  async listDatasources(): Promise<GrafanaDatasource[]> {
    return this.request<GrafanaDatasource[]>("/api/datasources");
  }

  async queryMetrics(params: {
    datasourceUid: string;
    expr: string;
    from?: string;
    to?: string;
    instant?: boolean;
  }): Promise<Record<string, GrafanaQueryResult>> {
    const body = {
      queries: [
        {
          datasource: { uid: params.datasourceUid, type: "prometheus" },
          expr: params.expr,
          refId: "A",
          instant: params.instant ?? true,
          range: !(params.instant ?? true),
          maxDataPoints: 300,
        },
      ],
      from: params.from ?? "now-1h",
      to: params.to ?? "now",
    };

    const raw = await this.request<{ results: Record<string, GrafanaQueryResult> }>(
      "/api/ds/query",
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    );
    return raw.results;
  }

  async listDashboards(query?: string): Promise<GrafanaDashboardSummary[]> {
    const qs = new URLSearchParams({ type: "dash-db", limit: "100" });
    if (query) qs.set("query", query);
    return this.request<GrafanaDashboardSummary[]>(`/api/search?${qs.toString()}`);
  }

  async getDashboard(uid: string): Promise<GrafanaDashboard> {
    return this.request<GrafanaDashboard>(`/api/dashboards/uid/${uid}`);
  }
}

export function formatGrafanaError(err: unknown): string {
  if (err instanceof GrafanaError) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return JSON.stringify({
        error: "Grafana authentication failed.",
        suggestion:
          "Check GRAFANA_TOKEN is valid and the service account has the Viewer role.",
        statusCode: err.statusCode,
      });
    }
    return JSON.stringify({
      error: err.message,
      suggestion: "Check GRAFANA_URL is reachable and GRAFANA_TOKEN is correct.",
    });
  }
  const msg = err instanceof Error ? err.message : String(err);
  // Redact any token-like strings from error messages
  const safe = msg.replace(/glsa_[A-Za-z0-9_]+/g, redactSecret);
  return JSON.stringify({ error: safe });
}
