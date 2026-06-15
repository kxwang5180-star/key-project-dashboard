import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWeeklyReportNotificationText,
  sendWeeklyReportProgressNotification,
} from "../src/services/weekly-report-notifications.js";

test("buildWeeklyReportNotificationText formats project progress for Feishu groups", () => {
  const text = buildWeeklyReportNotificationText({
    project: { shortName: "IPAD自助结账" },
    report: {
      weekNumber: 10,
      progress: "已完成自助结账链路联调，进入门店试点。",
      riskSummary: "需要协调门店培训资源",
      milestoneTitle: "全国推广准备",
    },
    user: { name: "王康旭" },
  });

  assert.match(text, /【重点项目周度进展】/);
  assert.match(text, /项目：IPAD自助结账/);
  assert.match(text, /周次：第10周/);
  assert.match(text, /提交人：王康旭/);
  assert.match(text, /关联里程碑：全国推广准备/);
  assert.match(text, /已完成自助结账链路联调/);
  assert.match(text, /风险与支持/);
});

test("sendWeeklyReportProgressNotification skips projects without Feishu chat binding", async () => {
  const result = await sendWeeklyReportProgressNotification({
    project: { shortName: "IPAD自助结账", feishuChatId: "" },
    report: { weekNumber: 10, progress: "本周完成联调" },
    user: { name: "王康旭" },
  });

  assert.deepEqual(result, { sent: false, skipped: true, reason: "项目未绑定飞书群聊" });
});
