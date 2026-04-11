import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  KafkaUiClient,
  formatKafkaUiError,
  type KafkaConsumerPartition,
} from "../clients/kafka-ui.js";
import type { Config, KafkaUiConfig } from "../config.js";
import { notConfiguredError } from "../config.js";

export const kafkaUiTools: Tool[] = [
  {
    name: "kafka_list_clusters",
    description:
      "List all Kafka clusters configured in Kafka UI. Returns name, status, broker count, topic count, and partition info.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "kafka_list_topics",
    description:
      "List topics in a Kafka cluster with partition count, replication factor, and under-replicated partition count.",
    inputSchema: {
      type: "object",
      properties: {
        cluster_name: {
          type: "string",
          description: "The Kafka cluster name. Use kafka_list_clusters to see available clusters.",
        },
        page: {
          type: "number",
          description: "Page number for pagination. Defaults to 1.",
        },
        per_page: {
          type: "number",
          description: "Number of topics per page. Defaults to 50.",
        },
      },
      required: ["cluster_name"],
    },
  },
  {
    name: "kafka_describe_topic",
    description:
      "Get detailed information about a specific Kafka topic including partition layout, replication, and segment info.",
    inputSchema: {
      type: "object",
      properties: {
        cluster_name: {
          type: "string",
          description: "The Kafka cluster name.",
        },
        topic_name: {
          type: "string",
          description: "The topic name.",
        },
      },
      required: ["cluster_name", "topic_name"],
    },
  },
  {
    name: "kafka_list_consumer_groups",
    description:
      "List consumer groups in a Kafka cluster with their state and member count.",
    inputSchema: {
      type: "object",
      properties: {
        cluster_name: {
          type: "string",
          description: "The Kafka cluster name.",
        },
        page: {
          type: "number",
          description: "Page number for pagination. Defaults to 1.",
        },
        per_page: {
          type: "number",
          description: "Number of groups per page. Defaults to 50.",
        },
      },
      required: ["cluster_name"],
    },
  },
  {
    name: "kafka_consumer_group_lag",
    description:
      "Get consumer lag for a specific consumer group — per-partition offset, end offset, and lag. Highlights partitions with non-zero lag.",
    inputSchema: {
      type: "object",
      properties: {
        cluster_name: {
          type: "string",
          description: "The Kafka cluster name.",
        },
        group_id: {
          type: "string",
          description: "The consumer group ID.",
        },
      },
      required: ["cluster_name", "group_id"],
    },
  },
  {
    name: "kafka_broker_health",
    description:
      "Get broker health for a Kafka cluster — broker IDs, hosts, ports, and disk usage.",
    inputSchema: {
      type: "object",
      properties: {
        cluster_name: {
          type: "string",
          description: "The Kafka cluster name.",
        },
      },
      required: ["cluster_name"],
    },
  },
];

function computeTotalLag(partitions: KafkaConsumerPartition[]): number {
  return partitions.reduce((sum, p) => sum + (p.lag ?? 0), 0);
}

export async function handleKafkaUiTool(
  name: string,
  args: Record<string, unknown>,
  config: Config
): Promise<string> {
  if (!config.kafkaUi.enabled) {
    return notConfiguredError("Kafka UI", "KAFKA_UI_URL");
  }

  const cfg = config.kafkaUi as KafkaUiConfig;
  const client = new KafkaUiClient(cfg.url, cfg.username, cfg.password);

  try {
    switch (name) {
      case "kafka_list_clusters": {
        const clusters = await client.listClusters();
        const count = clusters.length;
        const online = clusters.filter((c) => c.status === "online" || c.status === "Online").length;
        return JSON.stringify({
          summary: `Found ${count} Kafka cluster(s), ${online} online.`,
          data: clusters.map((c) => ({
            name: c.name,
            status: c.status,
            brokerCount: c.brokerCount,
            topicCount: c.topicCount,
            onlinePartitionCount: c.onlinePartitionCount,
            version: c.version,
          })),
          backend: "kafka-ui",
        });
      }

      case "kafka_list_topics": {
        const cluster = args["cluster_name"] as string;
        const page = (args["page"] as number | undefined) ?? 1;
        const perPage = (args["per_page"] as number | undefined) ?? 50;

        const result = await client.listTopics(cluster, page, perPage);
        const { topics, pageCount } = result;
        const underReplicated = topics.filter((t) => t.underReplicatedPartitions > 0).length;
        return JSON.stringify({
          summary: `Found ${topics.length} topic(s) in cluster "${cluster}" (page ${page}/${pageCount}). ${underReplicated} topic(s) with under-replicated partitions.`,
          data: {
            cluster,
            page,
            pageCount,
            topics: topics.map((t) => ({
              name: t.name,
              partitionCount: t.partitionCount,
              replicationFactor: t.replicationFactor,
              inSyncReplicas: t.inSyncReplicas,
              underReplicatedPartitions: t.underReplicatedPartitions,
              internal: t.internal,
            })),
          },
          backend: "kafka-ui",
        });
      }

      case "kafka_describe_topic": {
        const cluster = args["cluster_name"] as string;
        const topic = args["topic_name"] as string;

        const detail = await client.describeTopic(cluster, topic);
        return JSON.stringify({
          summary: `Topic "${topic}" in cluster "${cluster}": ${detail.partitionCount} partition(s), replication factor ${detail.replicationFactor}, ${detail.underReplicatedPartitions} under-replicated partition(s).`,
          data: {
            cluster,
            name: detail.name,
            partitionCount: detail.partitionCount,
            replicationFactor: detail.replicationFactor,
            inSyncReplicas: detail.inSyncReplicas,
            underReplicatedPartitions: detail.underReplicatedPartitions,
            segmentSize: detail.segmentSize,
            internal: detail.internal,
            partitions: detail.partitions,
          },
          backend: "kafka-ui",
        });
      }

      case "kafka_list_consumer_groups": {
        const cluster = args["cluster_name"] as string;
        const page = (args["page"] as number | undefined) ?? 1;
        const perPage = (args["per_page"] as number | undefined) ?? 50;

        const result = await client.listConsumerGroups(cluster, page, perPage);
        const { consumerGroups, pageCount } = result;
        const stable = consumerGroups.filter((g) => g.state === "Stable").length;
        return JSON.stringify({
          summary: `Found ${consumerGroups.length} consumer group(s) in cluster "${cluster}" (page ${page}/${pageCount}). ${stable} in Stable state.`,
          data: {
            cluster,
            page,
            pageCount,
            consumerGroups: consumerGroups.map((g) => ({
              groupId: g.groupId,
              state: g.state,
              members: g.members,
              topics: g.topics,
              partitionAssignor: g.partitionAssignor,
            })),
          },
          backend: "kafka-ui",
        });
      }

      case "kafka_consumer_group_lag": {
        const cluster = args["cluster_name"] as string;
        const groupId = args["group_id"] as string;

        const detail = await client.consumerGroupDetail(cluster, groupId);
        const totalLag = computeTotalLag(detail.partitions ?? []);
        const laggingPartitions = (detail.partitions ?? []).filter((p) => (p.lag ?? 0) > 0);

        return JSON.stringify({
          summary: `Consumer group "${groupId}" in cluster "${cluster}": total lag = ${totalLag}. ${laggingPartitions.length} partition(s) have non-zero lag. Status: ${detail.status}.`,
          data: {
            cluster,
            groupId: detail.groupId,
            status: detail.status,
            totalLag,
            memberCount: detail.members?.length ?? 0,
            partitions: (detail.partitions ?? []).map((p) => ({
              topic: p.topic,
              partition: p.partition,
              committedOffset: p.offset,
              endOffset: p.endOffset,
              lag: p.lag,
            })),
          },
          backend: "kafka-ui",
        });
      }

      case "kafka_broker_health": {
        const cluster = args["cluster_name"] as string;
        const brokers = await client.listBrokers(cluster);
        const count = brokers.length;
        return JSON.stringify({
          summary: `Cluster "${cluster}" has ${count} broker(s).`,
          data: {
            cluster,
            brokerCount: count,
            brokers: brokers.map((b) => ({
              id: b.id,
              host: b.host,
              port: b.port,
              rack: b.rack,
              diskUsage: b.diskUsage,
            })),
          },
          backend: "kafka-ui",
        });
      }

      default:
        return JSON.stringify({ error: `Unknown Kafka UI tool: ${name}` });
    }
  } catch (err) {
    return formatKafkaUiError(err);
  }
}
