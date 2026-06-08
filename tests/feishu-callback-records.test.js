import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFeishuCardCallbackAuditDetail,
  getFeishuCallbackEventType,
  getFeishuCardActionValue,
  resolveFeishuChallengeResponse,
  verifyFeishuCallbackToken,
} from "../src/services/feishu-callback-records.js";

test("resolveFeishuChallengeResponse handles Feishu url verification", () => {
  assert.deepEqual(
    resolveFeishuChallengeResponse({
      type: "url_verification",
      token: "verify-token",
      challenge: "challenge-code",
    }),
    { challenge: "challenge-code" }
  );
});

test("verifyFeishuCallbackToken accepts configured token and can skip empty token", () => {
  assert.deepEqual(verifyFeishuCallbackToken({ header: { token: "token_1" } }, "token_1"), {
    ok: true,
    skipped: false,
  });
  assert.equal(verifyFeishuCallbackToken({ header: { token: "bad" } }, "token_1").ok, false);
  assert.deepEqual(verifyFeishuCallbackToken({ header: { token: "bad" } }, ""), {
    ok: true,
    skipped: true,
  });
});

test("getFeishuCardActionValue reads new card callback structure", () => {
  const payload = {
    schema: "2.0",
    header: { event_type: "card.action.trigger" },
    event: {
      action: {
        value: { action: "milestone_reminder_ack", milestoneIds: ["m1"] },
      },
    },
  };

  assert.equal(getFeishuCallbackEventType(payload), "card.action.trigger");
  assert.deepEqual(getFeishuCardActionValue(payload), { action: "milestone_reminder_ack", milestoneIds: ["m1"] });
});

test("buildFeishuCardCallbackAuditDetail keeps callback audit compact", () => {
  const detail = buildFeishuCardCallbackAuditDetail({
    header: { event_id: "evt_1" },
    event: {
      operator: { open_id: "ou_1" },
      context: { open_chat_id: "oc_1" },
      action: {
        value: {
          action: "milestone_reminder_ack",
          projectIds: ["p1"],
          milestoneIds: ["m1"],
        },
      },
    },
  });

  assert.deepEqual(detail, {
    eventId: "evt_1",
    action: "milestone_reminder_ack",
    chatId: "oc_1",
    operatorOpenId: "ou_1",
    projectIds: ["p1"],
    milestoneIds: ["m1"],
  });
});
