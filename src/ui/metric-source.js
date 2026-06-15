export const PROJECT_METRIC_SOURCE_VERSION = "2026-06-latest-metrics-v3";

export function shouldUseSavedMetrics({ savedMetrics, sourceMetricRows = [], metricsSourceVersion = "" } = {}) {
  if (!Array.isArray(savedMetrics)) return false;
  if (metricsSourceVersion === PROJECT_METRIC_SOURCE_VERSION) return true;
  if (!savedMetrics.length) return false;
  if (!sourceMetricRows.length) return true;
  return metricsSourceVersion === PROJECT_METRIC_SOURCE_VERSION;
}
