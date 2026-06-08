import test from "node:test";
import assert from "node:assert/strict";
import { getMetricTargetStatus } from "../../src/ui/metric-status.js";

test("getMetricTargetStatus marks percent targets as in progress until target is reached", () => {
  assert.deepEqual(getMetricTargetStatus({ current: "73.9%", target: "100%" }), {
    key: "in-progress",
    label: "推进中",
    progress: 74,
    hasTarget: true,
    hasCurrent: true,
  });

  assert.equal(getMetricTargetStatus({ current: "100%", target: "100%" }).key, "achieved");
  assert.equal(getMetricTargetStatus({ current: "105%", target: "100%" }).key, "achieved");
});

test("getMetricTargetStatus tracks textual or inverse targets without a confirmation warning", () => {
  assert.deepEqual(getMetricTargetStatus({ current: "多套", target: "1套" }), {
    key: "tracking",
    label: "跟踪中",
    progress: null,
    hasTarget: true,
    hasCurrent: true,
  });
});

test("getMetricTargetStatus distinguishes target-only and current-only metrics", () => {
  assert.deepEqual(getMetricTargetStatus({ current: "-", target: "70%以上" }), {
    key: "goal",
    label: "目标",
    progress: null,
    hasTarget: true,
    hasCurrent: false,
  });
  assert.equal(getMetricTargetStatus({ current: "约85%", target: "-" }).key, "observing");
});
