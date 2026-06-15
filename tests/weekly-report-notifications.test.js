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
  assert.match(payload, /去查看/);
  assert.equal(card.body.elements.filter((element) => element.background_style === "grey").length, 1);
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

test("sendWeeklyReportProgressNotification sends an interactive Feishu card request", async () => {
  const originalFetch = global.fetch;
  const originalEnv = {
    JWT_SECRET: process.env.JWT_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    FEISHU_APP_ID: process.env.FEISHU_APP_ID,
    FEISHU_APP_SECRET: process.env.FEISHU_APP_SECRET,
    PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL,
  };
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test_secret";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "file:./test.db";
  process.env.FEISHU_APP_ID = "cli_test";
  process.env.FEISHU_APP_SECRET = "secret_test";
  process.env.PUBLIC_BASE_URL = "https://example.com/#report";
  const { config } = await import("../src/config.js");
  const originalFeishu = { ...config.feishu };
  const calls = [];
  config.feishu.appId = "cli_test";
  config.feishu.appSecret = "secret_test";
  config.feishu.publicBaseUrl = "https://example.com/#report";
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({
      code: 0,
      data: {
        message_id: "om_test",
      },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await sendWeeklyReportProgressNotification({
      project: { id: "project_10", shortName: "IPAD自助结账", feishuChatId: "oc_test" },
      report: {
        weekNumber: 10,
        progress: "本周完成联调",
        riskSummary: "暂无",
      },
      user: { name: "王康旭" },
      tenantAccessToken: "tenant_token_test",
    });
    const body = JSON.parse(calls[0].options.body);
    const card = JSON.parse(body.content);

    assert.equal(body.receive_id, "oc_test");
    assert.equal(body.msg_type, "interactive");
    assert.equal(card.schema, "2.0");
    assert.equal(card.header.template, "green");
    assert.equal(result.messageType, "interactive");
    assert.equal(result.cardTemplate, "green");
  } finally {
    global.fetch = originalFetch;
    Object.assign(config.feishu, originalFeishu);
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
