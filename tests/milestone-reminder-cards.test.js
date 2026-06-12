import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMilestoneReminderCard,
  buildMilestoneReminderCards,
  buildMilestoneReminderCallbackResponse,
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

function actionButtons(card) {
  return card.elements.find((element) => element.tag === "action")?.actions || [];
}

test("buildMilestoneReminderCard renders Feishu interactive card callback format", () => {
  const card = buildMilestoneReminderCard([target], { baseUrl: "https://example.com/" });

  assert.equal(card.schema, undefined);
  assert.equal(card.config.wide_screen, true);
  assert.equal(card.config.update_multi, true);
  assert.equal("callback" in card.config, false);
  assert.equal(card.header.title.content, "重点项目里程碑提醒");
  assert.equal(JSON.stringify(card).includes("合同系统"), true);
  assert.equal(JSON.stringify(card).includes("完成第四批5个用户使用体验优化"), true);
  assert.equal(JSON.stringify(card).includes("业务线：财务"), true);
  assert.equal(JSON.stringify(card).includes("负责人"), false);
  assert.equal(JSON.stringify(card).includes('"tag":"action"'), true);
});

test("buildMilestoneReminderCard uses legacy card text tags accepted by Feishu message update", () => {
  const card = buildMilestoneReminderCard([target], { baseUrl: "https://example.com/" });
  const textBlocks = card.elements.filter((element) => element.tag === "div").map((element) => element.text);

  assert.ok(textBlocks.length >= 3);
  assert.ok(textBlocks.every((text) => text.tag === "lark_md"));
});

test("buildMilestoneReminderCard includes open url and callback button values", () => {
  const card = buildMilestoneReminderCard([target], { baseUrl: "http://172.20.180.157/#report" });
  const actionSet = card.elements.at(-1);
  const row = card.elements.find((element) => element.tag === "div" && element.text.content.includes("合同系统"));
  const buttons = actionButtons(card);

  assert.equal(actionSet.tag, "action");
  assert.equal(row.tag, "div");
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].text.content, "确认完成");
  assert.equal(buttons[0].value.action, "mark_done");
  assert.equal(buttons[0].value.task_id, "m1");
  assert.deepEqual(buttons[0].value.milestoneIds, ["m1"]);
  assert.equal("targets" in buttons[0].value, false);
  assert.equal(buttons[1].text.content, "去维护");
  assert.equal(buttons[1].url, "http://172.20.180.157/#report:project_1");
  assert.equal(JSON.stringify(card).includes("我已知晓"), false);
  assert.equal(JSON.stringify(card).includes("milestone_reminder_ack"), false);
});

test("buildMilestoneReminderCard renders completed callback state", () => {
  const card = buildMilestoneReminderCard([target], {
    baseUrl: "http://172.20.180.157/#report",
    completedMilestoneIds: ["m1"],
  });
  const buttons = actionButtons(card);

  assert.equal(card.header.template, "green");
  assert.equal(JSON.stringify(card).includes("状态：已完成 ✅"), true);
  assert.equal(buttons[0].text.content, "已完成 ✅");
  assert.equal(buttons[0].disabled, true);
  assert.equal(buttons[0].value, undefined);
});

test("buildMilestoneReminderCallbackResponse accepts Feishu sample mark_done action", () => {
  const response = buildMilestoneReminderCallbackResponse({
    action: "mark_done",
    task_id: "m1",
    targets: [target],
    baseUrl: "http://172.20.180.157/#report",
  });
  const buttons = actionButtons(response.card);

  assert.equal(response.toast.type, "success");
  assert.equal(JSON.stringify(response.card).includes("状态：已完成 ✅"), true);
  assert.equal(buttons[0].text.content, "已完成 ✅");
  assert.equal(buttons[0].disabled, true);
});

test("buildMilestoneReminderCards splits targets into multiple cards", () => {
  const targets = Array.from({ length: 10 }, (_, index) => ({
    ...target,
    milestoneId: `m${index}`,
    milestoneTitle: `节点 ${index}`,
  }));
  const cards = buildMilestoneReminderCards(targets);

  assert.equal(cards.length, 2);
  assert.match(cards[0].elements[0].text.content, /8 个节点/);
  assert.match(cards[1].elements[0].text.content, /2 个节点/);
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
