import test from "node:test";
import assert from "node:assert/strict";
import { buildMetricObservation, splitMetricObservation } from "../src/services/metric-observation.js";

test("splitMetricObservation separates formula and observable time from combined legacy text", () => {
  assert.deepEqual(splitMetricObservation("门店数÷中台文员人数；可观测：2026/6/30"), {
    observation: "门店数÷中台文员人数",
    observable: "2026/6/30",
  });
});

test("splitMetricObservation keeps explicit observable fallback when no marker exists", () => {
  assert.deepEqual(splitMetricObservation("已完成数量÷计划总数", "当前已可观测"), {
    observation: "已完成数量÷计划总数",
    observable: "当前已可观测",
  });
});

test("buildMetricObservation combines formula and observable time for existing persistence field", () => {
  assert.equal(
    buildMetricObservation({
      observation: "门店数÷中台文员人数",
      observable: "2026/6/30",
    }),
    "门店数÷中台文员人数；可观测：2026/6/30"
  );
});
