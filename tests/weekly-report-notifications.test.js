import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWeeklyReportNotificationCard,
  sendWeeklyReportProgressNotification,
} from "../src/services/weekly-report-notifications.js";

test("buildWeeklyReportNotificationCard formats project progress as a green Feishu card", () => {
  const card = buildWeeklyReportNotificationCard({
    project: { id: "project_10", shortName: "IPAD自助结账" },
    report: {
      weekNumber: 10,
      progress: "已完成自助结账链路联调，进入门店试点。",
      riskSummary: "需要协调门店培训资源",
      milestoneTitle: "全国推广准备",
    },
    user: { name: "王康旭" },
    baseUrl: "https://example.com/#report",
  });
  const payload = JSON.stringify(card);

  assert.equal(card.schema, "2.0");
  assert.equal(card.header.title.content, "重点项目周度进展");
  assert.equal(card.header.subtitle.content, "IPAD自助结账 · 第10周");
  assert.equal(card.header.template, "green");
  assert.match(payload, /background_style":"grey/);
  assert.match(payload, /IPAD自助结账/);
  assert.match(payload, /提交人：王康旭/);
  assert.match(payload, /关联里程碑：全国推广准备/);
  assert.match(payload, /已完成自助结账链路联调/);
  assert.match(payload, /风险与支持/);
  assert.match(payload, /去维护/);
  assert.match(payload, /#report:project_10/);
});

test("sendWeeklyReportProgressNotification skips projects without Feishu chat binding", async () => {
  const result = await sendWeeklyReportProgressNotification({
    project: { shortName: "IPAD自助结账", feishuChatId: "" },
    report: { weekNumber: 10, progress: "本周完成联调" },
    user: { name: "王康旭" },
  });

  assert.deepEqual(result, { sent: false, skipped: true, reason: "项目未绑定飞书群聊" });
});
