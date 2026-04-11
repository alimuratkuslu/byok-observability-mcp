export interface PrometheusInstantResult {
  metric: Record<string, string>;
  value: [number, string]; // [timestamp, value_string]
}

export interface PrometheusRangeResult {
  metric: Record<string, string>;
  values: Array<[number, string]>; // [timestamp, value_string][]
}

export interface PrometheusQueryResponse<T> {
  status: "success" | "error";
  data: {
    resultType: "vector" | "matrix" | "scalar" | "string";
    result: T[];
  };
  errorType?: string;
  error?: string;
}

export interface PrometheusMetricMetadata {
  type: string;
  help: string;
  unit: string;
}

class PrometheusError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "PrometheusError";
  }
}

export class PrometheusClient {
  private headers: Record<string, string>;

  constructor(
    private baseUrl: string,
    username?: string,
    password?: string
  ) {
    this.headers = {
      Accept: "application/json",
    };
    if (username && password) {
      const encoded = Buffer.from(`${username}:${password}`).toString("base64");
      this.headers["Authorization"] = `Basic ${encoded}`;
    }
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
      throw new PrometheusError(0, `Cannot reach Prometheus at ${path}: ${msg}`);
    }

    if (!response.ok) {
      throw new PrometheusError(
        response.status,
        `Prometheus returned ${response.status} for ${path}`
      );
    }

    return response.json() as Promise<T>;
  }

  private async requestText(path: string): Promise<string> {
    const url = `${this.baseUrl}${path}`;
    let response: Response;
    try {
      response = await fetch(url, { headers: this.headers });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new PrometheusError(0, `Cannot reach Prometheus at ${path}: ${msg}`);
    }
    if (!response.ok) {
      throw new PrometheusError(
        response.status,
        `Prometheus returned ${response.status} for ${path}`
      );
    }
    return response.text();
  }

  async health(): Promise<boolean> {
    const text = await this.requestText("/-/healthy");
    return text.trim().toLowerCase().includes("healthy");
  }

  async query(
    expr: string,
    time?: string
  ): Promise<PrometheusQueryResponse<PrometheusInstantResult>> {
    const params = new URLSearchParams({ query: expr });
    if (time) params.set("time", time);
    return this.request<PrometheusQueryResponse<PrometheusInstantResult>>(
      `/api/v1/query?${params.toString()}`
    );
  }

  async queryRange(
    expr: string,
    start: string,
    end: string,
    step: string
  ): Promise<PrometheusQueryResponse<PrometheusRangeResult>> {
    const params = new URLSearchParams({ query: expr, start, end, step });
    return this.request<PrometheusQueryResponse<PrometheusRangeResult>>(
      `/api/v1/query_range?${params.toString()}`
    );
  }

  async listMetrics(): Promise<string[]> {
    const res = await this.request<{ status: string; data: string[] }>(
      "/api/v1/label/__name__/values"
    );
    return res.data ?? [];
  }

  async metricMetadata(
    metricName?: string
  ): Promise<Record<string, PrometheusMetricMetadata[]>> {
    const qs = metricName
      ? `?metric=${encodeURIComponent(metricName)}`
      : "";
    const res = await this.request<{
      status: string;
      data: Record<string, PrometheusMetricMetadata[]>;
    }>(`/api/v1/metadata${qs}`);
    return res.data ?? {};
  }
}

export function formatPrometheusError(err: unknown): string {
  if (err instanceof PrometheusError) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return JSON.stringify({
        error: "Prometheus authentication failed.",
        suggestion:
          "Check PROMETHEUS_USERNAME and PROMETHEUS_PASSWORD are correct.",
        statusCode: err.statusCode,
      });
    }
    return JSON.stringify({
      error: err.message,
      suggestion:
        "Check PROMETHEUS_URL is reachable and credentials are correct.",
    });
  }
  const msg = err instanceof Error ? err.message : String(err);
  return JSON.stringify({ error: msg });
}

export function formatInstantResults(
  results: PrometheusInstantResult[]
): Array<{ labels: Record<string, string>; value: string; timestamp: number }> {
  return results.map((r) => ({
    labels: r.metric,
    value: r.value[1],
    timestamp: r.value[0],
  }));
}

export function formatRangeResults(
  results: PrometheusRangeResult[]
): Array<{
  labels: Record<string, string>;
  values: Array<{ timestamp: number; value: string }>;
}> {
  return results.map((r) => ({
    labels: r.metric,
    values: r.values.map(([ts, v]) => ({ timestamp: ts, value: v })),
  }));
}
