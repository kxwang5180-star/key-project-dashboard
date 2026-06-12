import test from "node:test";
import assert from "node:assert/strict";
import {
  filterProjectsByReminderKeywords,
  parseMilestoneReminderArgs,
  resolveReminderReceiveId,
  shouldWriteReminderSentLogs,
} from "../src/services/milestone-reminder-preview.js";

test("parseMilestoneReminderArgs supports real reminder preview into a test chat", () => {
  const args = parseMilestoneReminderArgs([
    "--send",
    "--preview-chat-name=飞书机器人测试群",
    "--project-names=飞书测试",
    "--now=2026-06-12T09:00:00+08:00",
  ], { PUBLIC_BASE_URL: "http://localhost/#report" });

  assert.equal(args.send, true);
  assert.equal(args.previewChatName, "飞书机器人测试群");
  assert.deepEqual(args.projectKeywords, ["飞书测试"]);
  assert.equal(args.baseUrl, "http://localhost/#report");
});

test("resolveReminderReceiveId redirects only preview sends to the test chat", () => {
  assert.equal(resolveReminderReceiveId("oc_real", { previewChatId: "oc_test" }), "oc_test");
  assert.equal(resolveReminderReceiveId("oc_real", { previewChatId: "" }), "oc_real");
});

test("shouldWriteReminderSentLogs skips audit logs for preview sends", () => {
  assert.equal(shouldWriteReminderSentLogs({ send: true, previewChatId: "" }), true);
  assert.equal(shouldWriteReminderSentLogs({ send: true, previewChatId: "oc_test" }), false);
  assert.equal(shouldWriteReminderSentLogs({ send: false, previewChatId: "" }), false);
});

test("filterProjectsByReminderKeywords keeps real Feishu test project reminders", () => {
  const projects = filterProjectsByReminderKeywords([
    { name: "飞书测试 项目", shortName: "飞书测试" },
    { name: "合同系统", shortName: "合同" },
  ], ["飞书测试"]);

  assert.deepEqual(projects.map((project) => project.name), ["飞书测试 项目"]);
});
