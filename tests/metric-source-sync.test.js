import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDesiredMetricsForProject,
  buildMetricSourceReconciliationPlan,
  groupMetricSourceRowsByProject,
  metricSourceSyncKey,
} from "../src/services/metric-source-sync.js";

test("buildDesiredMetricsForProject maps latest metric rows to persisted metric shape", () => {
  const metricRowsByProject = groupMetricSourceRowsByProject([
    {
      projectName: "【合同系统】项目",
      name: "用户满意度8分以上占比",
      current: "41%",
      target: "55%",
      observation: "8分以上用户占比；可观测：Q2结束后问卷调研",
    },
  ]);

  assert.deepEqual(
    buildDesiredMetricsForProject({
      project: { id: "p01", name: "【合同管理系统】项目" },
      metricRowsByProject,
    }),
    [
      {
        projectId: "p01",
        name: "用户满意度8分以上占比",
        currentValue: "41%",
        targetValue: "55%",
        observation: "8分以上用户占比；可观测：Q2结束后问卷调研",
        chartType: "donut",
        sortOrder: 0,
      },
    ]
  );
});

test("metricSourceSyncKey keeps metric history when only observable wording changes", () => {
  assert.equal(
    metricSourceSyncKey({
      name: "人均管理门店数",
      targetValue: "10家/人",
      observation: "旧口径；可观测：旧时间",
    }),
    metricSourceSyncKey({
      name: "人均管理门店数",
      targetValue: "10家/人",
      observation: "门店数÷中台文员人数；可观测：2026/6/30",
    })
  );
});

test("buildMetricSourceReconciliationPlan removes stale no-history metrics and archives metrics with history", () => {
  const plan = buildMetricSourceReconciliationPlan({
    existingMetrics: [
      { id: "old_no_history", name: "工作日日均打卡人数", targetValue: "", _count: { records: 0 } },
      { id: "old_with_history", name: "休息日日均打卡人数", targetValue: "", _count: { records: 2 } },
    ],
    desiredMetrics: [
      {
        projectId: "p08",
        name: "门迎组薪资成本同比（除美甲师）",
        currentValue: null,
        targetValue: null,
        observation: "门迎组薪资成本；可观测：当前已可观测",
        chartType: "value",
        sortOrder: 0,
      },
    ],
  });

  assert.equal(plan.creates.length, 1);
  assert.deepEqual(plan.deleteIds, ["old_no_history"]);
  assert.deepEqual(plan.archive.map((metric) => metric.id), ["old_with_history"]);
});
