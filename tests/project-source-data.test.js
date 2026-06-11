import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function readProjectSource() {
  const sandbox = { window: {} };
  vm.runInNewContext(readFileSync("data.js", "utf8"), sandbox, { filename: "data.js" });
  return sandbox.window.PROJECT_SOURCE || [];
}

function readProjectData() {
  const sandbox = { window: {} };
  vm.runInNewContext(readFileSync("data.js", "utf8"), sandbox, { filename: "data.js" });
  return {
    projects: sandbox.window.PROJECT_SOURCE || [],
    milestones: sandbox.window.PROJECT_MILESTONE_SOURCE || [],
    metrics: sandbox.window.PROJECT_METRIC_SOURCE || [],
  };
}

test("project source maintains current business line and owner mapping", () => {
  const projects = readProjectSource();
  const expected = [
    ["【敏捷自助分析平台】项目", "数据", "王有良"],
    ["【大排档赋值计数】项目", "供应链", "于文超"],
    ["【流程引擎替换OA】项目", "协同办公", "刘长省"],
    ["【智能人事重构】项目", "财务人事", "徐建艇"],
    ["【合同管理系统】项目", "财务人事", "刘召皇"],
    ["【大会员体系】项目", "C端", "王昊"],
    ["【一餐系统】项目", "C端", "梁海军"],
    ["【POS点餐体验升级】项目", "C端", "梁海军"],
    ["【数字化门迎】项目", "门店提效", "杨家瑞"],
    ["【智能手表】项目", "门店提效", "付俣"],
    ["【工单调度系统】项目", "门店提效", "汪凌旭"],
    ["【文员提效】项目", "门店提效", "崔长远"],
    ["【IPAD自助结账】项目", "门店提效", "梁海军"],
    ["【KDS上菜房数字化】项目", "门店提效", "于文超"],
    ["【门店大脑+黄绿卡检查】项目", "门店提效", "李玉乐"],
  ];

  for (const [name, businessLine, owner] of expected) {
    const project = projects.find((item) => item.name === name);
    assert.ok(project, `${name} should exist`);
    assert.equal(project.businessLine, businessLine, `${name} businessLine`);
    assert.equal(project.owner, owner, `${name} owner`);
  }
});

test("project source maintains explicit milestone schedule", () => {
  const { milestones } = readProjectData();

  assert.equal(milestones.length, 56);
  assert.equal(milestones[0].projectName, "【合同系统】项目");
  assert.equal(milestones[0].title, "【用户使用体验与效率优化】完成第三批5个“用户使用体验与效率”优化");
  assert.equal(milestones[0].date, "2026/06/04");
  assert.equal(milestones.at(-1).projectName, "【敏捷自助分析平台】项目");
  assert.equal(milestones.at(-1).title, "【洞察分析】增加圈门店及圈菜品洞察分析功能");
  assert.equal(milestones.at(-1).date, "待定");
  assert.ok(
    milestones.some(
      (milestone) =>
        milestone.projectName === "【大排档赋值台计数】项目" &&
        milestone.title === "【试点推广】根据广州一店试点情况确定推广计划" &&
        milestone.date === "待定"
    )
  );
});

test("project source maintains explicit metric definitions", () => {
  const { metrics } = readProjectData();

  assert.equal(metrics.length, 43);
  assert.equal(metrics[0].projectName, "【合同系统】项目");
  assert.equal(metrics[0].name, "Q2需求完成率");
  assert.equal(metrics[0].current, "55.5%");
  assert.equal(metrics[0].target, "100%");
  assert.equal(metrics[0].observation, "已完成需求数÷Q2需求总数；可观测：当前已可观测");
  assert.ok(
    metrics.some(
      (metric) =>
        metric.projectName === "【IPAD自助结账】项目" &&
        metric.name === "年节省人工成本" &&
        metric.target === "2700万元"
    )
  );
  assert.equal(metrics.at(-1).projectName, "【流程引擎替换OA】项目");
  assert.equal(metrics.at(-1).name, "自动化事件执行成功率");
  assert.equal(metrics.at(-1).target, "≥70%");
});
