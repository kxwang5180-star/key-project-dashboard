import test from "node:test";
import assert from "node:assert/strict";
import { buildWeeklyReportSaveNotice } from "../../src/ui/report-save-notice.js";

test("buildWeeklyReportSaveNotice shows Feishu notification success", () => {
  assert.equal(
    buildWeeklyReportSaveNotice({
      projectName: "IPAD自助结账",
      week: 10,
      notification: { sent: true },
    }),
    "已保存 IPAD自助结账 第10周更新，已同步到服务端，已通知项目群"
  );
});

test("buildWeeklyReportSaveNotice shows skipped Feishu notification reason", () => {
  assert.equal(
    buildWeeklyReportSaveNotice({
      projectName: "IPAD自助结账",
      week: 10,
      notification: { sent: false, skipped: true, reason: "项目未绑定飞书群聊" },
    }),
    "已保存 IPAD自助结账 第10周更新，已同步到服务端，未通知项目群：项目未绑定飞书群聊"
  );
});

test("buildWeeklyReportSaveNotice shows failed Feishu notification reason", () => {
  assert.equal(
    buildWeeklyReportSaveNotice({
      projectName: "IPAD自助结账",
      week: 10,
      notification: { sent: false, skipped: false, reason: "飞书群通知发送失败" },
    }),
    "已保存 IPAD自助结账 第10周更新，已同步到服务端，群通知发送失败：飞书群通知发送失败"
  );
});
