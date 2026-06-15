import { splitMetricObservation } from "../services/metric-observation.js";

function cleanMetricValue(value = "") {
  const text = String(value || "").trim();
  return text && text !== "-" ? text : "";
}

export function buildMetricTargetDetail(metric = {}) {
  const parts = [cleanMetricValue(metric.name) || "项目指标"];
  const current = cleanMetricValue(metric.current);
  const target = cleanMetricValue(metric.target);
  const split = splitMetricObservation(metric.observation, metric.observable);
  const observation = cleanMetricValue(split.observation);
  const observable = cleanMetricValue(split.observable);
  if (current) parts.push(`当前：${current}`);
  if (target) parts.push(`目标：${target}`);
  if (observation) parts.push(`计算口径：${observation}`);
  if (observable) parts.push(`可观测：${observable}`);
  return parts.join("｜");
}
