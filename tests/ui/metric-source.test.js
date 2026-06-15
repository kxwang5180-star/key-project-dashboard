import test from "node:test";
import assert from "node:assert/strict";
import { PROJECT_METRIC_SOURCE_VERSION, shouldUseSavedMetrics } from "../../src/ui/metric-source.js";

test("shouldUseSavedMetrics ignores stale saved metrics when a structured source exists", () => {
  assert.equal(
    shouldUseSavedMetrics({
      savedMetrics: [{ name: "旧指标", current: "90%" }],
      sourceMetricRows: [{ projectName: "【IPAD自助结账】项目", name: "自助结账渗透率" }],
      metricsSourceVersion: "",
    }),
    false
  );
});

test("shouldUseSavedMetrics keeps user edits saved against the current metric source version", () => {
  assert.equal(
    shouldUseSavedMetrics({
      savedMetrics: [{ name: "自助结账渗透率", current: "10%" }],
      sourceMetricRows: [{ projectName: "【IPAD自助结账】项目", name: "自助结账渗透率" }],
      metricsSourceVersion: PROJECT_METRIC_SOURCE_VERSION,
    }),
    true
  );
});

test("shouldUseSavedMetrics preserves an intentional empty saved metric list", () => {
  assert.equal(
    shouldUseSavedMetrics({
      savedMetrics: [],
      sourceMetricRows: [{ projectName: "【IPAD自助结账】项目", name: "自助结账渗透率" }],
      metricsSourceVersion: PROJECT_METRIC_SOURCE_VERSION,
    }),
    true
  );
});
