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
  };
}
