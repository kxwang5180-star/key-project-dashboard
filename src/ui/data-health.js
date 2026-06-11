function percent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function toneForPercent(value) {
  if (value >= 85) return "green";
  if (value >= 55) return "amber";
  return "rose";
}

function hasCurrentMetric(metric = {}) {
  const current = String(metric.current || "").trim();
  return Boolean(current && current !== "-" && !/^(暂无|待填|待补充)$/i.test(current));
}

export function buildDataHealthModel({ source = "static", projects = [], reports = [], currentWeek = 0, getMetricItems = () => [] } = {}) {
  const projectCount = projects.length;
  const metricsReady = projects.filter((project) => {
    const metrics = getMetricItems(project);
    return Array.isArray(metrics) && metrics.some(hasCurrentMetric);
  }).length;
  const milestonesReady = projects.filter((project) => Array.isArray(project.milestones) && project.milestones.length > 0).length;
  const weeklyReady = projects.filter((project) =>
    reports.some((report) => report.projectId === project.id && Number(report.week) === Number(currentWeek))
  ).length;

  const metricPercent = percent(metricsReady, projectCount);
  const milestonePercent = percent(milestonesReady, projectCount);
  const weeklyPercent = percent(weeklyReady, projectCount);
  const isServer = source === "server";
  const sourceScore = isServer ? 100 : 0;
  const overallScore = projectCount ? Math.round((sourceScore + metricPercent + milestonePercent + weeklyPercent) / 4) : 0;

  return {
    source,
    sourceLabel: isServer ? "服务端已联通" : "静态基线",
    overallScore,
    cards: [
      {
        key: "source",
        label: "数据来源",
        value: isServer ? "服务端" : "静态",
        detail: isServer ? "项目、指标、里程碑来自接口" : "当前使用内置基线数据",
        tone: isServer ? "green" : "blue",
      },
      {
        key: "metrics",
        label: "指标覆盖",
        value: `${metricPercent}%`,
        detail: `${metricsReady}/${projectCount} 个项目已有当前指标`,
        tone: toneForPercent(metricPercent),
      },
      {
        key: "milestones",
        label: "里程碑覆盖",
        value: `${milestonePercent}%`,
        detail: `${milestonesReady}/${projectCount} 个项目已有节点`,
        tone: toneForPercent(milestonePercent),
      },
      {
        key: "weekly",
        label: "本周更新",
        value: `${weeklyPercent}%`,
        detail: `${weeklyReady}/${projectCount} 个项目已更新第${currentWeek}周`,
        tone: toneForPercent(weeklyPercent),
      },
    ],
  };
}
