import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMilestoneReminderMessages,
  buildMilestoneReminderTargets,
  buildMilestoneReminderText,
  getMilestoneReminderDateRange,
  getMilestoneReminderAction,
  getMilestoneReminderTargetId,
  getMilestoneReminderWindow,
  groupMilestoneReminderTargets,
} from "../src/services/milestone-reminders.js";

test("getMilestoneReminderWindow returns tomorrow and today date keys", () => {
  assert.deepEqual(getMilestoneReminderWindow(new Date("2026-06-08T12:00:00.000Z")), [
    { timing: "tomorrow", label: "明日到期", dateKey: "2026-06-09" },
    { timing: "today", label: "今日到期", dateKey: "2026-06-08" },
    { timing: "catchup", label: "非工作日到期", dateKey: "2026-06-06" },
    { timing: "catchup", label: "非工作日到期", dateKey: "2026-06-07" },
  ]);
});

test("getMilestoneReminderWindow uses China timezone by default", () => {
  assert.deepEqual(getMilestoneReminderWindow(new Date("2026-06-08T17:30:00.000Z")), [
    { timing: "tomorrow", label: "明日到期", dateKey: "2026-06-10" },
    { timing: "today", label: "今日到期", dateKey: "2026-06-09" },
  ]);
});

test("getMilestoneReminderWindow catches non-workday due dates on the next workday", () => {
  assert.deepEqual(getMilestoneReminderWindow(new Date("2026-06-08T02:30:00.000Z")), [
    { timing: "tomorrow", label: "明日到期", dateKey: "2026-06-09" },
    { timing: "today", label: "今日到期", dateKey: "2026-06-08" },
    { timing: "catchup", label: "非工作日到期", dateKey: "2026-06-06" },
    { timing: "catchup", label: "非工作日到期", dateKey: "2026-06-07" },
  ]);
});

test("getMilestoneReminderDateRange exposes the exact database date scan window", () => {
  const range = getMilestoneReminderDateRange(new Date("2026-06-08T02:30:00.000Z"));
  assert.equal(range.minDate.toISOString(), "2026-06-06T00:00:00.000Z");
  assert.equal(range.maxDate.toISOString(), "2026-06-09T00:00:00.000Z");
  assert.deepEqual(range.dateKeys, ["2026-06-09", "2026-06-08", "2026-06-06", "2026-06-07"]);
});

test("buildMilestoneReminderTargets selects due milestones with project chat ids", () => {
  const targets = buildMilestoneReminderTargets(
    [
      {
        id: "project_1",
        name: "【KDS上菜房数字化】项目",
        shortName: "KDS上菜房数字化",
        feishuChatId: "oc_1",
      milestones: [
        { id: "m_today", title: "联调完成", dueDate: new Date("2026-06-08T00:00:00.000Z"), status: "IN_PROGRESS" },
        { id: "m_tomorrow", title: "开发完成", dueDate: new Date("2026-06-09T00:00:00.000Z"), status: "PLANNED" },
        { id: "m_weekend", title: "周末上线", dueDate: new Date("2026-06-07T00:00:00.000Z"), status: "PLANNED" },
        { id: "m_done", title: "已完成节点", dueDate: new Date("2026-06-09T00:00:00.000Z"), status: "COMPLETED" },
        { id: "m_later", title: "下周节点", dueDate: new Date("2026-06-15T00:00:00.000Z"), status: "PLANNED" },
        ],
      },
      {
        id: "project_2",
        name: "未绑定群项目",
        feishuChatId: "",
        milestones: [{ id: "m_no_chat", title: "今日节点", dueDate: new Date("2026-06-08T00:00:00.000Z") }],
      },
    ],
    new Date("2026-06-08T09:00:00.000Z")
  );

  assert.deepEqual(
    targets.map((item) => [item.chatId, item.milestoneId, item.timing, item.dueDate]),
    [
      ["oc_1", "m_tomorrow", "tomorrow", "2026-06-09"],
      ["oc_1", "m_today", "today", "2026-06-08"],
      ["oc_1", "m_weekend", "catchup", "2026-06-07"],
    ]
  );
});

test("groupMilestoneReminderTargets and buildMilestoneReminderText prepare chat messages", () => {
  const targets = [
    {
      chatId: "oc_1",
      projectName: "合同系统",
      milestoneTitle: "完成第四批优化",
      dueDate: "2026-06-30",
      timingLabel: "明日到期",
    },
    {
      chatId: "oc_2",
      projectName: "文员提效",
      milestoneTitle: "全国推广完成",
      dueDate: "2026-06-15",
      timingLabel: "今日到期",
    },
  ];

  const grouped = groupMilestoneReminderTargets(targets);
  assert.equal(grouped.get("oc_1").length, 1);
  assert.equal(grouped.get("oc_2").length, 1);

  const text = buildMilestoneReminderText(grouped.get("oc_1"));
  assert.match(text, /重点项目里程碑提醒/);
  assert.match(text, /明日到期/);
  assert.match(text, /合同系统｜完成第四批优化/);
});

test("buildMilestoneReminderText keeps tomorrow before today and sorts inside each section", () => {
  const text = buildMilestoneReminderText([
    {
      chatId: "oc_1",
      projectName: "文员提效",
      milestoneTitle: "全国推广完成",
      dueDate: "2026-06-15",
      timing: "today",
      timingLabel: "今日到期",
    },
    {
      chatId: "oc_1",
      projectName: "合同系统",
      milestoneTitle: "完成第四批优化",
      dueDate: "2026-06-30",
      timing: "tomorrow",
      timingLabel: "明日到期",
    },
  ]);

  assert.ok(text.indexOf("明日到期") < text.indexOf("今日到期"));
  assert.match(text, /合同系统｜完成第四批优化/);
});

test("buildMilestoneReminderMessages splits long chat reminders", () => {
  const targets = Array.from({ length: 8 }, (_, index) => ({
    chatId: "oc_1",
    projectName: `项目${index}`,
    milestoneTitle: `这是一个较长的里程碑标题 ${index} `.repeat(6),
    dueDate: "2026-06-30",
    timing: "tomorrow",
    timingLabel: "明日到期",
  }));

  const messages = buildMilestoneReminderMessages(targets, { maxChars: 520 });
  assert.ok(messages.length > 1);
  assert.ok(messages.every((message) => message.length <= 520));
});

test("buildMilestoneReminderMessages compacts a single oversized milestone line", () => {
  const messages = buildMilestoneReminderMessages(
    [
      {
        chatId: "oc_1",
        projectName: "超长项目名称".repeat(20),
        milestoneTitle: "超长里程碑标题".repeat(80),
        dueDate: "2026-06-30",
        timing: "tomorrow",
        timingLabel: "明日到期",
      },
    ],
    { maxChars: 500 }
  );

  assert.equal(messages.length, 1);
  assert.ok(messages[0].length <= 500);
  assert.match(messages[0], /…/);
});

test("getMilestoneReminderAction and getMilestoneReminderTargetId are stable for dedupe logs", () => {
  assert.equal(getMilestoneReminderAction({ timing: "today" }), "milestone.reminder.today");
  assert.equal(getMilestoneReminderTargetId({ milestoneId: "m1", timing: "today" }), "m1");
  assert.equal(
    getMilestoneReminderTargetId({
      projectId: "p1",
      dueDate: "2026-06-30",
      timing: "tomorrow",
      milestoneTitle: "节点",
    }),
    "p1:2026-06-30:tomorrow:节点"
  );
});
