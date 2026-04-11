export interface KafkaCluster {
  name: string;
  defaultCluster: boolean;
  status: string;
  brokerCount: number;
  onlinePartitionCount: number;
  topicCount: number;
  bytesInPerSec?: number;
  bytesOutPerSec?: number;
  version?: string;
}

export interface KafkaTopic {
  name: string;
  internal: boolean;
  partitionCount: number;
  replicationFactor: number;
  replicas: number;
  inSyncReplicas: number;
  segmentSize: number;
  segmentCount: number;
  underReplicatedPartitions: number;
}

export interface KafkaTopicDetail extends KafkaTopic {
  config?: Record<string, string>;
  partitions?: KafkaPartition[];
}

export interface KafkaPartition {
  partition: number;
  leader: number;
  replicas: number[];
  inSyncReplicas: number[];
  offsetMin: number;
  offsetMax: number;
}

export interface KafkaConsumerGroup {
  groupId: string;
  members: number;
  topics: number;
  simple: boolean;
  partitionAssignor: string;
  state: string;
}

export interface KafkaConsumerGroupDetail {
  groupId: string;
  status: string;
  simpleConsumerGroup: boolean;
  partitionAssignor: string;
  members: KafkaConsumerMember[];
  partitions: KafkaConsumerPartition[];
}

export interface KafkaConsumerMember {
  consumerId: string;
  groupInstanceId?: string;
  clientId: string;
  host: string;
  topicPartitions: Array<{ topic: string; partition: number }>;
}

export interface KafkaConsumerPartition {
  topic: string;
  partition: number;
  partitionId?: number;
  offset: number;
  endOffset: number;
  lag: number;
}

export interface KafkaBroker {
  id: number;
  host: string;
  port: number;
  rack?: string;
  bytesInPerSec?: number;
  bytesOutPerSec?: number;
  diskUsage?: Array<{ mountpoint: string; size: number; usage: number }>;
}

export interface PaginatedTopics {
  topics: KafkaTopic[];
  pageCount: number;
}

export interface PaginatedConsumerGroups {
  consumerGroups: KafkaConsumerGroup[];
  pageCount: number;
}

class KafkaUiError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "KafkaUiError";
  }
}

export class KafkaUiClient {
  private headers: Record<string, string>;

  constructor(
    private baseUrl: string,
    username?: string,
    password?: string
  ) {
    this.headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
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
      throw new KafkaUiError(0, `Cannot reach Kafka UI at ${path}: ${msg}`);
    }

    if (!response.ok) {
      let detail = "";
      try {
        const body = (await response.json()) as { message?: string };
        detail = body.message ?? "";
      } catch {
        // ignore parse errors
      }
      throw new KafkaUiError(
        response.status,
        `Kafka UI returned ${response.status} for ${path}${detail ? ": " + detail : ""}`
      );
    }

    return response.json() as Promise<T>;
  }

  async listClusters(): Promise<KafkaCluster[]> {
    return this.request<KafkaCluster[]>("/api/clusters");
  }

  async listTopics(
    cluster: string,
    page = 1,
    perPage = 50
  ): Promise<PaginatedTopics> {
    const qs = new URLSearchParams({
      page: String(page),
      perPage: String(perPage),
      sortBy: "NAME",
      sortOrder: "ASC",
    });
    return this.request<PaginatedTopics>(
      `/api/clusters/${encodeURIComponent(cluster)}/topics?${qs.toString()}`
    );
  }

  async describeTopic(cluster: string, topic: string): Promise<KafkaTopicDetail> {
    return this.request<KafkaTopicDetail>(
      `/api/clusters/${encodeURIComponent(cluster)}/topics/${encodeURIComponent(topic)}`
    );
  }

  async listConsumerGroups(
    cluster: string,
    page = 1,
    perPage = 50
  ): Promise<PaginatedConsumerGroups> {
    const qs = new URLSearchParams({
      page: String(page),
      perPage: String(perPage),
    });
    return this.request<PaginatedConsumerGroups>(
      `/api/clusters/${encodeURIComponent(cluster)}/consumer-groups?${qs.toString()}`
    );
  }

  async consumerGroupDetail(
    cluster: string,
    groupId: string
  ): Promise<KafkaConsumerGroupDetail> {
    return this.request<KafkaConsumerGroupDetail>(
      `/api/clusters/${encodeURIComponent(cluster)}/consumer-groups/${encodeURIComponent(groupId)}`
    );
  }

  async listBrokers(cluster: string): Promise<KafkaBroker[]> {
    return this.request<KafkaBroker[]>(
      `/api/clusters/${encodeURIComponent(cluster)}/brokers`
    );
  }
}

export function formatKafkaUiError(err: unknown): string {
  if (err instanceof KafkaUiError) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return JSON.stringify({
        error: "Kafka UI authentication failed.",
        suggestion:
          "Check KAFKA_UI_USERNAME and KAFKA_UI_PASSWORD are correct.",
        statusCode: err.statusCode,
      });
    }
    if (err.statusCode === 404) {
      return JSON.stringify({
        error: err.message,
        suggestion:
          "Check the cluster name and topic/group name are correct. Use kafka_list_clusters to see available clusters.",
      });
    }
    return JSON.stringify({
      error: err.message,
      suggestion: "Check KAFKA_UI_URL is reachable and credentials are correct.",
    });
  }
  const msg = err instanceof Error ? err.message : String(err);
  return JSON.stringify({ error: msg });
}
