import test from "node:test";
import assert from "node:assert/strict";
import { buildMetricDashboardModel } from "../../src/ui/metric-dashboard.js";

const projects = [
  { id: "p1", shortName: "合同系统", businessLine: "财务人事", color: "#2563eb" },
  { id: "p2", shortName: "门店大脑", businessLine: "门店提效", color: "#0f9f6e" },
  { id: "p3", shortName: "流程引擎", businessLine: "协同办公", color: "#e39318" },
  { id: "p4", shortName: "一餐系统", businessLine: "C端", color: "#6d5bd0" },
];

const metricMap = {
  p1: [
    {
      id: "m1",
      name: "Q2需求完成进度",
      current: "73.9%",
      target: "100%",
      observation: "已完成需求数 / Q2需求总数",
      observable: "当前已可观测",
      history: [
        { date: "2026-06-01", value: "55%" },
        { date: "2026-06-11", value: "73.9%" },
      ],
    },
    { id: "m2", name: "问题完成进度", current: "100%", target: "100%", observation: "" },
  ],
  p2: [
    { id: "m3", name: "客群标签精度", current: "85%", target: "85%", observation: "" },
    { id: "m4", name: "覆盖门店", current: "", target: "500家", observation: "" },
  ],
  p3: [{ id: "m5", name: "审批自动化执行成功率", current: "70%", target: "70%", observation: "" }],
};

test("buildMetricDashboardModel summarizes metric status and readiness", () => {
  const model = buildMetricDashboardModel(projects, (project) => metricMap[project.id] || []);

  assert.equal(model.summary.projectCount, 4);
  assert.equal(model.summary.metricCount, 5);
  assert.equal(model.summary.targetedCount, 5);
  assert.equal(model.summary.achievedCount, 3);
  assert.equal(model.summary.goalOnlyCount, 1);
  assert.equal(model.summary.readiness, 80);
  assert.equal(model.records[0].observable, "当前已可观测");
  assert.deepEqual(
    model.statusSlices.map((slice) => [slice.key, slice.count]),
    [
      ["in-progress", 1],
      ["needs-attention", 1],
      ["achieved", 3],
    ]
  );
});

test("buildMetricDashboardModel builds business line slices without ranking or global trend widgets", () => {
  const model = buildMetricDashboardModel(projects, (project) => metricMap[project.id] || []);

  assert.deepEqual(
    model.businessLineSlices.map((slice) => [slice.label, slice.count]),
    [
      ["财务人事", 2],
      ["门店提效", 2],
      ["协同办公", 1],
    ]
  );
  assert.equal("topMetrics" in model, false);
  assert.equal("trendSeries" in model, false);
});

test("buildMetricDashboardModel groups every metric by business line with actionable order", () => {
  const model = buildMetricDashboardModel(projects, (project) => metricMap[project.id] || []);

  assert.equal(model.metricGroups.reduce((sum, group) => sum + group.metrics.length, 0), 5);
  assert.deepEqual(
    model.metricGroups.map((group) => [group.label, group.metricCount, group.projectCount]),
    [
      ["财务人事", 2, 1],
      ["门店提效", 2, 1],
      ["协同办公", 1, 1],
    ]
  );
  assert.deepEqual(
    model.metricGroups[0].metrics.map((metric) => [metric.name, metric.status.key]),
    [
      ["Q2需求完成进度", "in-progress"],
      ["问题完成进度", "achieved"],
    ]
  );
  assert.deepEqual(
    model.actionGroups.map((group) => [group.key, group.count]),
    [
      ["in-progress", 1],
      ["needs-attention", 1],
      ["achieved", 3],
    ]
  );
  assert.deepEqual(model.actionGroups[1].details.map((item) => [item.key, item.count]), [["goal", 1]]);
});

test("buildMetricDashboardModel groups metrics by project and keeps empty projects visible", () => {
  const model = buildMetricDashboardModel(projects, (project) => metricMap[project.id] || []);

  assert.equal(model.projectGroups.length, 4);
  assert.deepEqual(
    model.projectGroups.map((group) => [group.projectName, group.metricCount, group.currentCount, group.targetCount]),
    [
      ["合同系统", 2, 2, 2],
      ["门店大脑", 2, 1, 2],
      ["流程引擎", 1, 1, 1],
      ["一餐系统", 0, 0, 0],
    ]
  );
  assert.equal(model.projectGroups.at(-1).leadStatus, "empty");
});
