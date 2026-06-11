import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMilestoneReminderCard,
  buildMilestoneReminderCards,
  buildProjectScopedMilestoneReminderCards,
} from "../src/services/milestone-reminder-cards.js";

const target = {
  chatId: "oc_1",
  projectId: "project_1",
  projectName: "合同系统",
  businessLine: "财务",
  milestoneId: "m1",
  milestoneTitle: "完成第四批5个用户使用体验优化",
  dueDate: "2026-06-30",
  timing: "tomorrow",
  timingLabel: "明日到期",
};

test("buildMilestoneReminderCard renders Feishu JSON 2.0 interactive card", () => {
  const card = buildMilestoneReminderCard([target], { baseUrl: "https://example.com/" });

  assert.equal(card.schema, "2.0");
  assert.equal(card.config.update_multi, true);
  assert.equal(card.config.callback, true);
  assert.equal(card.header.title.content, "重点项目里程碑提醒");
  assert.equal(JSON.stringify(card).includes("合同系统"), true);
  assert.equal(JSON.stringify(card).includes("完成第四批5个用户使用体验优化"), true);
  assert.equal(JSON.stringify(card).includes("业务线：财务"), true);
  assert.equal(JSON.stringify(card).includes("负责人"), false);
  assert.equal(JSON.stringify(card).includes('"tag":"action"'), false);
});

test("buildMilestoneReminderCard gives body components stable JSON 2.0 element ids", () => {
  const card = buildMilestoneReminderCard([target], { baseUrl: "https://example.com/" });
  const elements = card.body.elements;
  assert.ok(elements.every((element) => /^[a-z][a-zA-Z0-9_]{0,19}$/.test(element.element_id)));
  const row = elements.find((element) => element.element_id === "row_ms_0");
  assert.ok(row.columns.every((column) => /^[a-z][a-zA-Z0-9_]{0,19}$/.test(column.element_id)));
  assert.ok(row.columns[0].elements.every((element) => /^[a-z][a-zA-Z0-9_]{0,19}$/.test(element.element_id)));
});

test("buildMilestoneReminderCard includes open url and callback button behaviors", () => {
  const card = buildMilestoneReminderCard([target], { baseUrl: "http://172.20.180.157/#report" });
  const actionSet = card.body.elements.at(-1);
  const row = card.body.elements.find((element) => element.element_id === "row_ms_0");
  const buttons = actionSet.columns.flatMap((column) => column.elements);

  assert.equal(actionSet.tag, "column_set");
  assert.equal(row.columns.length, 1);
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].text.content, "确认完成");
  assert.equal(buttons[0].size, "medium");
  assert.equal(buttons[0].behaviors[0].type, "callback");
  assert.equal(buttons[0].behaviors[0].value.action, "milestone_reminder_mark_done");
  assert.deepEqual(buttons[0].behaviors[0].value.milestoneIds, ["m1"]);
  assert.equal(buttons[1].text.content, "去维护");
  assert.equal(buttons[1].size, "medium");
  assert.equal(buttons[1].behaviors[0].type, "open_url");
  assert.equal(buttons[1].behaviors[0].default_url, "http://172.20.180.157/#report:project_1");
  assert.equal(JSON.stringify(card).includes("我已知晓"), false);
  assert.equal(JSON.stringify(card).includes("milestone_reminder_ack"), false);
});

test("buildMilestoneReminderCard renders completed callback state", () => {
  const card = buildMilestoneReminderCard([target], {
    baseUrl: "http://172.20.180.157/#report",
    completedMilestoneIds: ["m1"],
  });
  const actionSet = card.body.elements.at(-1);
  const buttons = actionSet.columns.flatMap((column) => column.elements);

  assert.equal(card.header.template, "green");
  assert.equal(JSON.stringify(card).includes("状态：已完成 ✅"), true);
  assert.equal(buttons[0].text.content, "已完成 ✅");
  assert.equal(buttons[0].disabled, true);
  assert.equal(buttons[0].behaviors, undefined);
});

test("buildMilestoneReminderCards splits targets into multiple cards", () => {
  const targets = Array.from({ length: 10 }, (_, index) => ({
    ...target,
    milestoneId: `m${index}`,
    milestoneTitle: `节点 ${index}`,
  }));
  const cards = buildMilestoneReminderCards(targets);

  assert.equal(cards.length, 2);
  assert.match(cards[0].header.subtitle.content, /8 个节点/);
  assert.match(cards[1].header.subtitle.content, /2 个节点/);
});

test("buildProjectScopedMilestoneReminderCards sends test cards separately by project", () => {
  const cards = buildProjectScopedMilestoneReminderCards([
    target,
    { ...target, projectId: "project_2", projectName: "数字化门迎", milestoneId: "m2" },
  ], { baseUrl: "http://172.20.180.157/#report" });

  assert.equal(cards.length, 2);
  assert.match(JSON.stringify(cards[0]), /合同系统/);
  assert.doesNotMatch(JSON.stringify(cards[0]), /数字化门迎/);
  assert.match(JSON.stringify(cards[1]), /数字化门迎/);
});
