import test from "node:test";
import assert from "node:assert/strict";
import {
  isMilestoneDoneAction,
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
