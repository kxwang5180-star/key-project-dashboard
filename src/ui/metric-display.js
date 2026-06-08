function cleanMetricValue(value = "") {
  const text = String(value || "").trim();
  return text && text !== "-" ? text : "";
}

export function buildMetricTargetDetail(metric = {}) {
  const parts = [cleanMetricValue(metric.name) || "项目指标"];
  const current = cleanMetricValue(metric.current);
  const target = cleanMetricValue(metric.target);
  const observation = cleanMetricValue(metric.observation);
  if (current) parts.push(`当前：${current}`);
  if (target) parts.push(`目标：${target}`);
  if (observation) parts.push(`计算口径：${observation}`);
  return parts.join("｜");
}
