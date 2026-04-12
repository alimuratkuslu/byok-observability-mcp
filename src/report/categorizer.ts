import { CollectedData } from "./collector.js";

export type Severity = "P0" | "P1" | "P2" | "P3";

export interface ReportItem {
  severity: Severity;
  backend: string;
  message: string;
  detail?: string;
}

const LAG_HIGH_THRESHOLD = 10_000;
const LAG_MEDIUM_THRESHOLD = 1_000;

const SEVERITY_ORDER: Record<Severity, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

export function categorize(data: CollectedData): ReportItem[] {
  const items: ReportItem[] = [];

  // --- Grafana ---
  if (data.grafana) {
    if (!data.grafana.reachable) {
      items.push({
        severity: "P0",
        backend: "Grafana",
        message: "Grafana unreachable",
        detail: data.grafana.error,
      });
    } else {
      for (const alert of data.grafana.alerts) {
        const name = alert.labels["alertname"] ?? "Unknown Alert";
        const severity = (alert.labels["severity"] ?? "").toLowerCase();
        const state = alert.status.state;
        const isSilenced = alert.status.silencedBy.length > 0;
        const isInhibited = alert.status.inhibitedBy.length > 0;
        const summary =
          alert.annotations["summary"] ?? alert.annotations["description"];

        if (isSilenced || isInhibited) {
          items.push({
            severity: "P3",
            backend: "Grafana",
            message: `${name} — silenced alert`,
          });
          continue;
        }

        if (state === "active") {
          items.push({
            severity: severity === "critical" ? "P0" : "P1",
            backend: "Grafana",
            message: `FIRING: ${name}`,
            detail: summary,
          });
        } else if (state === "unprocessed") {
          items.push({
            severity: "P2",
            backend: "Grafana",
            message: `PENDING: ${name}`,
            detail: summary,
          });
        }
      }

      if (data.grafana.alerts.length === 0) {
        items.push({
          severity: "P3",
          backend: "Grafana",
          message: "No active alerts",
        });
      }
    }
  }

  // --- Prometheus ---
  if (data.prometheus) {
    if (!data.prometheus.reachable) {
      items.push({
        severity: "P0",
        backend: "Prometheus",
        message: "Prometheus unreachable",
        detail: data.prometheus.error,
      });
    } else if (!data.prometheus.healthy) {
      items.push({
        severity: "P0",
        backend: "Prometheus",
        message: "Prometheus is unhealthy",
      });
    } else {
      items.push({
        severity: "P3",
        backend: "Prometheus",
        message: "Prometheus healthy",
      });
    }
  }

  // --- Kafka ---
  if (data.kafka) {
    if (!data.kafka.reachable) {
      items.push({
        severity: "P0",
        backend: "Kafka",
        message: "Kafka UI unreachable",
        detail: data.kafka.error,
      });
    } else {
      for (const cluster of data.kafka.clusters) {
        if (cluster.status !== "ONLINE") {
          items.push({
            severity: "P0",
            backend: "Kafka",
            message: `Cluster offline: ${cluster.name}`,
            detail: `Status: ${cluster.status}`,
          });
        } else {
          items.push({
            severity: "P3",
            backend: "Kafka",
            message: `Cluster ${cluster.name} — ONLINE (${cluster.brokerCount} brokers, ${cluster.topicCount} topics)`,
          });
        }
      }

      for (const group of data.kafka.consumerGroups) {
        if (group.totalLag > LAG_HIGH_THRESHOLD) {
          items.push({
            severity: "P1",
            backend: "Kafka",
            message: `High consumer lag: ${group.groupId}`,
            detail: `Cluster: ${group.cluster} — Total lag: ${group.totalLag.toLocaleString()}`,
          });
        } else if (group.totalLag > LAG_MEDIUM_THRESHOLD) {
          items.push({
            severity: "P2",
            backend: "Kafka",
            message: `Consumer lag growing: ${group.groupId}`,
            detail: `Cluster: ${group.cluster} — Total lag: ${group.totalLag.toLocaleString()}`,
          });
        }
      }
    }
  }

  return items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
