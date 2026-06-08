export function parseMetricNumber(value) {
  const match = String(value || "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function clampMetricProgress(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isBlankMetricValue(value) {
  const text = String(value || "").trim();
  return !text || text === "-" || /^(暂无|待填|待补充|待持续观测)$/i.test(text);
}

function isPercentLike(value) {
  return /%|百分比|占比|完成率|准确率|覆盖率|自动化率|超时率|取消率|NPS/i.test(String(value || ""));
}

function isHigherBetterTarget(metric) {
  const text = `${metric?.name || ""} ${metric?.target || ""} ${metric?.observation || ""}`;
  if (/降低|减少|下降|节省|成本|耗电|超时|取消|时长|数量.*合并|合并为/i.test(text)) return false;
  return isPercentLike(text) || /以上|提升|达到|不少于|至少|完成|覆盖/i.test(text);
}

export function getMetricTargetStatus(metric = {}) {
  const currentText = String(metric.current || "").trim();
  const targetText = String(metric.target || "").trim();
  const currentNumber = parseMetricNumber(currentText);
  const targetNumber = parseMetricNumber(targetText);
  const hasCurrent = !isBlankMetricValue(currentText);
  const hasTarget = !isBlankMetricValue(targetText);

  if (!hasTarget && hasCurrent) {
    return { key: "observing", label: "观察中", progress: null, hasTarget: false, hasCurrent: true };
  }
  if (hasTarget && !hasCurrent) {
    return { key: "goal", label: "目标", progress: null, hasTarget: true, hasCurrent: false };
  }
  if (!hasTarget && !hasCurrent) {
    return { key: "empty", label: "待补充", progress: null, hasTarget: false, hasCurrent: false };
  }
  if (currentNumber === null || targetNumber === null || targetNumber === 0 || !isHigherBetterTarget(metric)) {
    return { key: "tracking", label: "跟踪中", progress: null, hasTarget: true, hasCurrent: true };
  }

  const progress = clampMetricProgress((currentNumber / targetNumber) * 100);
  return {
    key: currentNumber >= targetNumber ? "achieved" : "in-progress",
    label: currentNumber >= targetNumber ? "已达成" : "推进中",
    progress,
    hasTarget: true,
    hasCurrent: true,
  };
}
