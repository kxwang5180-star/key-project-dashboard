import test from "node:test";
import assert from "node:assert/strict";
import { buildDataHealthModel } from "../../src/ui/data-health.js";

const projects = [
  { id: "p1", shortName: "合同系统", milestones: [{ id: "m1" }, { id: "m2" }] },
  { id: "p2", shortName: "门店大脑", milestones: [] },
  { id: "p3", shortName: "流程引擎", milestones: [{ id: "m3" }] },
];

const metricMap = {
  p1: [{ name: "完成率", current: "80%", target: "100%" }],
  p2: [{ name: "覆盖门店", current: "", target: "500家" }],
  p3: [{ name: "执行成功率", current: "70%", target: "70%" }],
};

test("buildDataHealthModel summarizes connected service data quality", () => {
  const model = buildDataHealthModel({
    source: "server",
    projects,
    reports: [
      { projectId: "p1", week: 11 },
      { projectId: "p3", week: 11 },
    ],
    currentWeek: 11,
    getMetricItems: (project) => metricMap[project.id] || [],
  });

  assert.equal(model.sourceLabel, "服务端已联通");
  assert.equal(model.overallScore, 75);
  assert.deepEqual(
    model.cards.map((card) => [card.key, card.value, card.tone]),
    [
      ["source", "服务端", "green"],
      ["metrics", "67%", "amber"],
      ["milestones", "67%", "amber"],
      ["weekly", "67%", "amber"],
    ]
  );
});

test("buildDataHealthModel marks static baseline and empty data safely", () => {
  const model = buildDataHealthModel({
    source: "static",
    projects: [],
    reports: [],
    currentWeek: 11,
    getMetricItems: () => [],
  });

  assert.equal(model.sourceLabel, "静态基线");
  assert.equal(model.overallScore, 0);
  assert.equal(model.cards[0].value, "静态");
  assert.equal(model.cards[0].tone, "blue");
});
