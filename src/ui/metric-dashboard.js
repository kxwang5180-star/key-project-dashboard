import { getMetricTargetStatus, parseMetricNumber } from "./metric-status.js";

const STATUS_LABELS = {
  achieved: "已达成",
  "in-progress": "推进中",
  tracking: "跟踪中",
  goal: "仅目标",
  observing: "观察中",
  empty: "待补充",
};

const STATUS_ORDER = ["achieved", "in-progress", "tracking", "goal", "observing", "empty"];
const ACTION_STATUS_ORDER = ["in-progress", "goal", "tracking", "observing", "empty", "achieved"];

function getActionRank(record) {
  const rank = ACTION_STATUS_ORDER.indexOf(record.status.key);
  return rank === -1 ? ACTION_STATUS_ORDER.length : rank;
}

function toMetricRecord(project, metric, index) {
  const status = getMetricTargetStatus(metric);
  const currentNumber = parseMetricNumber(metric.current);
  const progress = status.progress;
  return {
    id: `${project.id}:${metric.id || index}`,
    projectId: project.id,
    projectName: project.shortName || project.name || "未命名项目",
    businessLine: project.businessLine || "未填业务线",
    color: project.color || "#2563eb",
    name: metric.name || `指标 ${index + 1}`,
    current: metric.current || "",
    target: metric.target || "",
    observation: metric.observation || "",
    history: Array.isArray(metric.history) ? metric.history : [],
    status,
    progress,
    currentNumber,
  };
}

function buildStatusSlices(records) {
  return STATUS_ORDER
    .map((key) => ({
      key,
      label: STATUS_LABELS[key],
      count: records.filter((record) => record.status.key === key).length,
    }))
    .filter((slice) => slice.count > 0);
}

function buildBusinessLineSlices(records) {
  const counts = new Map();
  records.forEach((record) => {
    counts.set(record.businessLine, (counts.get(record.businessLine) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-CN"));
}

function buildTrendSeries(records) {
  const points = records
    .flatMap((record) =>
      record.history.map((item) => ({
        date: String(item.date || "").trim(),
        value: parseMetricNumber(item.value),
      }))
    )
    .filter((point) => point.date && point.value !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  return points.map((point) => ({
    date: point.date,
    label: point.date.slice(5).replace("-", "/"),
    value: Math.round(point.value),
  }));
}

function buildMetricGroups(records) {
  const groups = new Map();
  records.forEach((record) => {
    if (!groups.has(record.businessLine)) {
      groups.set(record.businessLine, {
        label: record.businessLine,
        metricCount: 0,
        projectIds: new Set(),
        metrics: [],
      });
    }
    const group = groups.get(record.businessLine);
    group.metricCount += 1;
    group.projectIds.add(record.projectId);
    group.metrics.push(record);
  });

  return [...groups.values()]
    .map((group) => ({
      label: group.label,
      metricCount: group.metricCount,
      projectCount: group.projectIds.size,
      metrics: group.metrics.sort(
        (a, b) => getActionRank(a) - getActionRank(b) || a.projectName.localeCompare(b.projectName, "zh-CN") || a.name.localeCompare(b.name, "zh-CN")
      ),
    }))
    .sort((a, b) => b.metricCount - a.metricCount || a.label.localeCompare(b.label, "zh-CN"));
}

function buildActionGroups(records) {
  return ACTION_STATUS_ORDER
    .map((key) => ({
      key,
      label: STATUS_LABELS[key],
      count: records.filter((record) => record.status.key === key).length,
    }))
    .filter((group) => group.count > 0);
}

function buildProjectGroups(projects, records) {
  return projects
    .map((project) => {
      const metrics = records.filter((record) => record.projectId === project.id);
      const statusCounts = STATUS_ORDER
        .map((key) => ({
          key,
          label: STATUS_LABELS[key],
          count: metrics.filter((record) => record.status.key === key).length,
        }))
        .filter((item) => item.count > 0);
      const currentCount = metrics.filter((record) => record.status.hasCurrent).length;
      const targetCount = metrics.filter((record) => record.status.hasTarget).length;
      const leadStatus = metrics
        .slice()
        .sort((a, b) => getActionRank(a) - getActionRank(b))[0]?.status.key || "empty";

      return {
        projectId: project.id,
        projectName: project.shortName || project.name || "未命名项目",
        businessLine: project.businessLine || "未填业务线",
        owner: project.owner || "未填写",
        color: project.color || "#2563eb",
        metricCount: metrics.length,
        currentCount,
        targetCount,
        readiness: metrics.length ? Math.round((currentCount / metrics.length) * 100) : 0,
        targetCoverage: metrics.length ? Math.round((targetCount / metrics.length) * 100) : 0,
        leadStatus,
        statusCounts,
        metrics: metrics.sort((a, b) => getActionRank(a) - getActionRank(b) || a.name.localeCompare(b.name, "zh-CN")),
      };
    })
    .sort((a, b) => {
      if (a.metricCount === 0 && b.metricCount > 0) return 1;
      if (a.metricCount > 0 && b.metricCount === 0) return -1;
      return a.businessLine.localeCompare(b.businessLine, "zh-CN") || a.projectName.localeCompare(b.projectName, "zh-CN");
    });
}

export function buildMetricDashboardModel(projects, getMetricItems) {
  const records = projects.flatMap((project) =>
    getMetricItems(project).map((metric, index) => toMetricRecord(project, metric, index))
  );
  const targetedCount = records.filter((record) => record.status.hasTarget).length;
  const currentCount = records.filter((record) => record.status.hasCurrent).length;
  const achievedCount = records.filter((record) => record.status.key === "achieved").length;
  const inProgressCount = records.filter((record) => record.status.key === "in-progress").length;
  const goalOnlyCount = records.filter((record) => record.status.key === "goal").length;
  const readiness = records.length ? Math.round((currentCount / records.length) * 100) : 0;

  return {
    records,
    summary: {
      projectCount: projects.length,
      metricCount: records.length,
      targetedCount,
      currentCount,
      achievedCount,
      inProgressCount,
      goalOnlyCount,
      readiness,
    },
    statusSlices: buildStatusSlices(records),
    businessLineSlices: buildBusinessLineSlices(records),
    topMetrics: records
      .filter((record) => record.progress !== null)
      .sort((a, b) => b.progress - a.progress || (b.currentNumber || 0) - (a.currentNumber || 0) || a.name.localeCompare(b.name, "zh-CN"))
      .slice(0, 8),
    trendSeries: buildTrendSeries(records).slice(-12),
    metricGroups: buildMetricGroups(records),
    actionGroups: buildActionGroups(records),
    projectGroups: buildProjectGroups(projects, records),
  };
}
