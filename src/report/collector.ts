import { Config } from "../config.js";
import { GrafanaClient, GrafanaAlert } from "../clients/grafana.js";
import { PrometheusClient } from "../clients/prometheus.js";
import { KafkaUiClient, KafkaCluster } from "../clients/kafka-ui.js";

export interface GrafanaCollected {
  reachable: boolean;
  alerts: GrafanaAlert[];
  error?: string;
}

export interface PrometheusCollected {
  reachable: boolean;
  healthy: boolean;
  error?: string;
}

export interface KafkaConsumerGroupWithLag {
  cluster: string;
  groupId: string;
  totalLag: number;
  state: string;
}

export interface KafkaCollected {
  reachable: boolean;
  clusters: KafkaCluster[];
  consumerGroups: KafkaConsumerGroupWithLag[];
  error?: string;
}

export interface CollectedData {
  timestamp: string;
  grafana?: GrafanaCollected;
  prometheus?: PrometheusCollected;
  kafka?: KafkaCollected;
}

export async function collectData(
  config: Config,
  reportBackends: string[]
): Promise<CollectedData> {
  const timestamp = new Date().toISOString();
  const result: CollectedData = { timestamp };

  const shouldInclude = (backend: string): boolean =>
    reportBackends.length === 0 || reportBackends.includes(backend);

  const tasks: Promise<void>[] = [];

  if (shouldInclude("grafana") && config.grafana.enabled) {
    const client = new GrafanaClient(config.grafana.url, config.grafana.token);
    tasks.push(
      (async () => {
        try {
          const alerts = await client.listAlerts({ active: true, silenced: true, inhibited: true });
          result.grafana = { reachable: true, alerts };
        } catch (err) {
          result.grafana = {
            reachable: false,
            alerts: [],
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })()
    );
  }

  if (shouldInclude("prometheus") && config.prometheus.enabled) {
    const client = new PrometheusClient(
      config.prometheus.url,
      config.prometheus.username,
      config.prometheus.password
    );
    tasks.push(
      (async () => {
        try {
          const healthy = await client.health();
          result.prometheus = { reachable: true, healthy };
        } catch (err) {
          result.prometheus = {
            reachable: false,
            healthy: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })()
    );
  }

  if (shouldInclude("kafka") && config.kafkaUi.enabled) {
    const client = new KafkaUiClient(
      config.kafkaUi.url,
      config.kafkaUi.username,
      config.kafkaUi.password
    );
    tasks.push(
      (async () => {
        try {
          const clusters = await client.listClusters();
          const consumerGroups: KafkaConsumerGroupWithLag[] = [];

          await Promise.allSettled(
            clusters.map(async (cluster) => {
              try {
                const { consumerGroups: groups } = await client.listConsumerGroups(cluster.name);
                await Promise.allSettled(
                  groups.map(async (group) => {
                    try {
                      const detail = await client.consumerGroupDetail(cluster.name, group.groupId);
                      const totalLag = detail.partitions.reduce((sum, p) => sum + p.lag, 0);
                      consumerGroups.push({
                        cluster: cluster.name,
                        groupId: group.groupId,
                        totalLag,
                        state: group.state,
                      });
                    } catch {
                      // skip individual group errors
                    }
                  })
                );
              } catch {
                // skip individual cluster errors
              }
            })
          );

          result.kafka = { reachable: true, clusters, consumerGroups };
        } catch (err) {
          result.kafka = {
            reachable: false,
            clusters: [],
            consumerGroups: [],
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })()
    );
  }

  await Promise.allSettled(tasks);
  return result;
}
