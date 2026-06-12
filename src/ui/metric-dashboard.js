import { getMetricTargetStatus } from "./metric-status.js";

const STATUS_LABELS = {
  achieved: "已达成",
  "in-progress": "推进中",
  tracking: "跟踪中",
  goal: "仅目标",
  observing: "观察中",
  empty: "待补充",
};

const STATUS_ORDER = ["achieved", "in-progress", "tracking", "goal", "observing", "empty"];
const DASHBOARD_STATUS_LABELS = {
  "in-progress": "推进中",
  "needs-attention": "待完善",
  achieved: "已达成",
};
const DASHBOARD_STATUS_ORDER = ["in-progress", "needs-attention", "achieved"];
const ACTION_STATUS_ORDER = ["in-progress", "tracking", "goal", "observing", "empty", "achieved"];

function toDashboardStatus(statusKey) {
  if (statusKey === "achieved") return { key: "achieved", label: DASHBOARD_STATUS_LABELS.achieved };
  if (statusKey === "in-progress" || statusKey === "tracking") {
    return { key: "in-progress", label: DASHBOARD_STATUS_LABELS["in-progress"] };
  }
  return { key: "needs-attention", label: DASHBOARD_STATUS_LABELS["needs-attention"] };
}

function getActionRank(record) {
  const rank = ACTION_STATUS_ORDER.indexOf(record.status.key);
  return rank === -1 ? ACTION_STATUS_ORDER.length : rank;
}

function toMetricRecord(project, metric, index) {
  const status = getMetricTargetStatus(metric);
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
    dashboardStatus: toDashboardStatus(status.key),
    progress,
  };
}

function buildStatusSlices(records) {
  return DASHBOARD_STATUS_ORDER
    .map((key) => ({
      key,
      label: DASHBOARD_STATUS_LABELS[key],
      count: records.filter((record) => record.dashboardStatus.key === key).length,
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
  return DASHBOARD_STATUS_ORDER
    .map((key) => ({
      key,
      label: DASHBOARD_STATUS_LABELS[key],
      count: records.filter((record) => record.dashboardStatus.key === key).length,
      details: STATUS_ORDER
        .map((statusKey) => ({
          key: statusKey,
          label: STATUS_LABELS[statusKey],
          count: records.filter((record) => record.dashboardStatus.key === key && record.status.key === statusKey).length,
        }))
        .filter((item) => item.count > 0),
    }))
    .filter((group) => group.count > 0);
}

function buildProjectGroups(projects, records) {
  return projects
    .map((project) => {
      const metrics = records.filter((record) => record.projectId === project.id);
      const statusCounts = STATUS_ORDER
        .reduce((counts, key) => {
          const dashboardStatus = toDashboardStatus(key);
          const count = metrics.filter((record) => record.status.key === key).length;
          if (!count) return counts;
          const existing = counts.find((item) => item.key === dashboardStatus.key);
          if (existing) existing.count += count;
          else counts.push({ ...dashboardStatus, count });
          return counts;
        }, [])
        .sort((a, b) => DASHBOARD_STATUS_ORDER.indexOf(a.key) - DASHBOARD_STATUS_ORDER.indexOf(b.key))
      const currentCount = metrics.filter((record) => record.status.hasCurrent).length;
      const targetCount = metrics.filter((record) => record.status.hasTarget).length;
      const leadRecord = metrics
        .slice()
        .sort((a, b) => getActionRank(a) - getActionRank(b))[0];
      const leadStatus = leadRecord?.dashboardStatus.key || "empty";

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
  const inProgressCount = records.filter((record) => record.dashboardStatus.key === "in-progress").length;
  const needsAttentionCount = records.filter((record) => record.dashboardStatus.key === "needs-attention").length;
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
      needsAttentionCount,
      goalOnlyCount,
      readiness,
    },
    statusSlices: buildStatusSlices(records),
    businessLineSlices: buildBusinessLineSlices(records),
    metricGroups: buildMetricGroups(records),
    actionGroups: buildActionGroups(records),
    projectGroups: buildProjectGroups(projects, records),
  };
}
