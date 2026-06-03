import test from "node:test";
import assert from "node:assert/strict";
import { buildBootstrapProjectPayload } from "../src/services/bootstrap-records.js";

test("buildBootstrapProjectPayload exposes frontend-ready project state", () => {
  const payload = buildBootstrapProjectPayload({
    id: "p1",
    name: "重点项目A",
    shortName: "项目A",
    businessLine: "零售",
    description: "当前阶段：试点中",
    metricsSummary: "覆盖率 65%",
    keyNodesSummary: "6月18日 完成试点",
    futurePlan: "7月1日 全量上线",
    teamSummary: "产品：张三",
    ownerName: "王五",
    established: true,
    isKeyProject: true,
    feishuChatId: "oc_1",
    stage: "IN_PROGRESS",
    changeSummary: "日期调整",
    metrics: [
      {
        id: "metric1",
        name: "覆盖率",
        currentValue: "65%",
        targetValue: "100%",
        observation: "周一查看",
        chartType: "percent",
      },
    ],
    milestones: [
      {
        id: "ms1",
        title: "完成试点",
        rawText: "6月18日 完成试点",
        dueDate: new Date("2026-06-18T00:00:00.000Z"),
        status: "IN_PROGRESS",
        source: "项目维护",
      },
    ],
    risks: [
      {
        id: "risk1",
        level: "MEDIUM",
        title: "资源风险",
        detail: "资源需协调",
        ownerName: "王五",
        status: "OPEN",
        source: "项目维护",
      },
    ],
    members: [{ id: "pm1", userId: "u1", memberId: "ou_1", name: "张三", email: "a@example.com" }],
    reports: [{ id: "r1", week: 1 }],
  });

  assert.equal(payload.brief.owner, "王五");
  assert.deepEqual(payload.projectState.metrics[0], {
    id: "metric1",
    name: "覆盖率",
    current: "65%",
    target: "100%",
    observation: "周一查看",
    chartType: "percent",
  });
  assert.equal(payload.projectState.milestones[0].dateKey, "2026-06-18");
  assert.equal(payload.projectState.milestones[0].status, "in-progress");
  assert.equal(payload.projectState.risks[0].status, "open");
  assert.deepEqual(payload.members, [{ id: "pm1", userId: "u1", memberId: "ou_1", name: "张三", email: "a@example.com" }]);
  assert.deepEqual(payload.reports, [{ id: "r1", week: 1 }]);
});

test("buildBootstrapProjectPayload does not leak raw nested database records", () => {
  const payload = buildBootstrapProjectPayload({
    id: "p1",
    name: "重点项目A",
    shortName: "项目A",
    businessLine: "零售",
    description: "说明",
    metricsSummary: "指标",
    keyNodesSummary: "节点",
    futurePlan: "计划",
    teamSummary: "团队",
    metrics: [{ id: "metric1", records: [{ id: "record1", value: "65%" }] }],
    milestones: [{ id: "ms1", title: "节点" }],
    risks: [{ id: "risk1", title: "风险", detail: "详情" }],
    members: [],
    reports: [],
  });

  assert.equal(Object.hasOwn(payload, "metrics"), false);
  assert.equal(Object.hasOwn(payload, "milestones"), false);
  assert.equal(Object.hasOwn(payload, "risks"), false);
  assert.equal(Object.hasOwn(payload.projectState, "metrics"), true);
  assert.equal(Object.hasOwn(payload.projectState, "milestones"), true);
  assert.equal(Object.hasOwn(payload.projectState, "risks"), true);
});
