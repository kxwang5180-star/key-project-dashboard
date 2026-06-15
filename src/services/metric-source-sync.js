import { buildProjectMetricCreateData, splitMetricCreateDataForUpdate } from "./project-records.js";
import { normalizeSeedKey, planSeedRecordReconciliation } from "./seed-sync-records.js";

export function cleanProjectName(name) {
  return String(name || "")
    .replace(/[【】]/g, "")
    .replace(/项目$/, "")
    .trim();
}

export function canonicalProjectKey(name) {
  const aliases = {
    合同系统: "合同管理系统",
    大排档赋值台计数: "大排档赋值计数",
  };
  const cleanName = cleanProjectName(name);
  return aliases[cleanName] || cleanName;
}

function parseMetricNumber(value) {
  const match = String(value || "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function groupMetricSourceRowsByProject(metrics = []) {
  return metrics.reduce((map, metric) => {
    const key = canonicalProjectKey(metric.projectName);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(metric);
    return map;
  }, new Map());
}

export function metricSourceSyncKey(metric) {
  return [normalizeSeedKey(metric?.name), normalizeSeedKey(metric?.targetValue ?? metric?.target)].join("|");
}

export function buildDesiredMetricsForProject({ project, metricRowsByProject }) {
  const rows = metricRowsByProject.get(canonicalProjectKey(project.name)) || [];
  return rows.map((metric, index) =>
    buildProjectMetricCreateData(
      {
        ...metric,
        chartType: parseMetricNumber(metric.target) !== null ? "donut" : "value",
      },
      { projectId: project.id, index }
    )
  );
}

export function buildMetricSourceReconciliationPlan({ existingMetrics = [], desiredMetrics = [] } = {}) {
  return planSeedRecordReconciliation({
    existingRecords: existingMetrics,
    desiredRecords: desiredMetrics,
    getExistingKey: metricSourceSyncKey,
    getDesiredKey: metricSourceSyncKey,
    relationName: "records",
  });
}

export function splitDesiredMetricForUpdate(metric) {
  return splitMetricCreateDataForUpdate(metric);
}
