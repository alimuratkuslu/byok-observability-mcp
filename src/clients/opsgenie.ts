import type { OpsGenieConfig } from "../config.js";

// Basic OpsGenie Alert interface
export interface OpsGenieAlert {
  id: string;
  tinyId: string;
  message: string;
  status: string;
  acknowledged: boolean;
  priority: string;
  createdAt: string;
}

export interface OpsGenieSchedule {
  id: string;
  name: string;
  description?: string;
}

export interface OpsGenieOnCall {
  exactMatch: Array<{
    user: {
      type: string;
      username: string; // The email of the person
    };
  }>;
}

export class OpsGenieClient {
  private baseUrl: string;

  constructor(private config: OpsGenieConfig) {
    this.baseUrl = config.apiUrl.startsWith("http")
      ? config.apiUrl
      : `https://${config.apiUrl}`;
  }

  private async fetchApi<T>(
    path: string,
    method: "GET" | "POST" = "GET",
    body?: any
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      Authorization: `GenieKey ${this.config.apiKey}`,
      "Content-Type": "application/json",
    };

    const init: RequestInit = { method, headers };
    if (body) {
      init.body = JSON.stringify(body);
    }

    const res = await fetch(url, init);
    if (!res.ok) {
        let errStr = res.statusText;
        try {
            const errObj = await res.json();
            if (errObj.message) errStr = errObj.message;
        } catch {
            // ignore
        }
        throw new Error(`OpsGenie API error: HTTP ${res.status} - ${errStr}`);
    }

    const data = await res.json();
    return data;
  }

  async getOpenAlerts(limit = 20): Promise<OpsGenieAlert[]> {
    const data = await this.fetchApi<{ data: OpsGenieAlert[] }>(
      `/v2/alerts?query=status%3Aopen&limit=${limit}&sort=createdAt&order=desc`
    );
    return data.data || [];
  }

  async getSchedules(): Promise<OpsGenieSchedule[]> {
    const data = await this.fetchApi<{ data: OpsGenieSchedule[] }>(
      `/v2/schedules`
    );
    return data.data || [];
  }

  async getOnCall(scheduleId: string): Promise<OpsGenieOnCall> {
    const data = await this.fetchApi<{ data: { _parent: any; onCallParticipants: any } }>(
      `/v2/schedules/${encodeURIComponent(scheduleId)}/on-calls`
    );
    // OpsGenie returns { data: { onCallParticipants: [ { name: "...", type: "user" } ] } }
    // We will loosely try to map this to our interface for the tools.
    // Wait, the API v2 actually returns "onCallParticipants": [] 
    return data.data as any; // We'll handle mapping in the tool for safety
  }

  async acknowledgeAlert(identifier: string): Promise<void> {
    if (!this.config.allowWrite) {
      throw new Error(
        "Write operations are disabled. Set OPSGENIE_ALLOW_WRITE=true to enable acknowledge operations."
      );
    }
    await this.fetchApi(`/v2/alerts/${encodeURIComponent(identifier)}/acknowledge?identifierType=id`, "POST", {
        note: "Acknowledged via observability-mcp",
    });
  }
}
