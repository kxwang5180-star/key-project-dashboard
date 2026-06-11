export const PROJECT_METRIC_SOURCE_VERSION = "2026-06-observable-metrics-v2";

export function shouldUseSavedMetrics({ savedMetrics, sourceMetricRows = [], metricsSourceVersion = "" } = {}) {
  if (!Array.isArray(savedMetrics) || !savedMetrics.length) return false;
  if (!sourceMetricRows.length) return true;
  return metricsSourceVersion === PROJECT_METRIC_SOURCE_VERSION;
}
