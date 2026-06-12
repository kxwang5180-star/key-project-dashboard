import test from "node:test";
import assert from "node:assert/strict";
import {
  isMilestoneDoneAction,
  loadMilestoneReminderTargetsByIds,
  markMilestoneReminderDone,
  normalizeCallbackMilestoneIds,
} from "../src/services/feishu-card-callbacks.js";

test("normalizeCallbackMilestoneIds trims empty callback milestone ids", () => {
  assert.deepEqual(normalizeCallbackMilestoneIds({ milestoneIds: [" m1 ", "", null, "m2"] }), ["m1", "m2"]);
  assert.deepEqual(normalizeCallbackMilestoneIds({ milestoneIds: "m1", task_id: "m3" }), ["m3"]);
  assert.deepEqual(normalizeCallbackMilestoneIds({ taskId: "m4" }), ["m4"]);
});

test("isMilestoneDoneAction accepts current and Feishu sample callback actions", () => {
  assert.equal(isMilestoneDoneAction("milestone_reminder_mark_done"), true);
  assert.equal(isMilestoneDoneAction("mark_done"), true);
  assert.equal(isMilestoneDoneAction("other"), false);
});

test("loadMilestoneReminderTargetsByIds rebuilds card targets from database milestones", async () => {
  const result = await loadMilestoneReminderTargetsByIds({
    milestoneIds: ["m2", "m1"],
    client: {
      milestone: {
        findMany: async (args) => {
          assert.deepEqual(args.where, { id: { in: ["m2", "m1"] } });
          return [
            {
              id: "m1",
              title: "第一个节点",
              dueDate: new Date("2026-06-09T00:00:00.000Z"),
              status: "PLANNED",
              project: {
                id: "p1",
                name: "合同系统",
                shortName: "合同",
                businessLine: "财务",
                feishuChatId: "oc_1",
              },
            },
            {
              id: "m2",
              title: "第二个节点",
              dueDate: new Date("2026-06-10T00:00:00.000Z"),
              status: "IN_PROGRESS",
              project: {
                id: "p2",
                name: "数字化门迎",
                shortName: "",
                businessLine: "门店",
                feishuChatId: "oc_2",
              },
            },
          ];
        },
      },
    },
  });

  assert.deepEqual(result.map((item) => item.milestoneId), ["m2", "m1"]);
  assert.deepEqual(result.map((item) => item.projectName), ["数字化门迎", "合同"]);
  assert.equal(result[0].dueDate, "2026-06-10");
  assert.equal(result[0].completed, true);
});

test("markMilestoneReminderDone updates unfinished milestones to completed", async () => {
  const calls = [];
  const result = await markMilestoneReminderDone({
    milestoneIds: [" m1 ", "m2"],
    client: {
      milestone: {
        updateMany: async (args) => {
          calls.push(args);
          return { count: 2 };
        },
      },
    },
  });

  assert.deepEqual(result, { count: 2 });
  assert.deepEqual(calls, [
    {
      where: {
        id: { in: ["m1", "m2"] },
        status: { not: "COMPLETED" },
      },
      data: {
        status: "COMPLETED",
        changeSummary: "通过飞书里程碑提醒卡片确认完成",
      },
    },
  ]);
});

test("markMilestoneReminderDone skips database updates without milestone ids", async () => {
  let called = false;
  const result = await markMilestoneReminderDone({
    milestoneIds: [" "],
    client: {
      milestone: {
        updateMany: async () => {
          called = true;
        },
      },
    },
  });

  assert.equal(called, false);
  assert.deepEqual(result, { count: 0 });
});
