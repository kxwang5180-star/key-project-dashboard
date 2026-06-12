import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFeishuCardCallbackAuditDetail,
  getFeishuCallbackEventType,
  getFeishuCardActionValue,
  getFeishuCallbackMessageId,
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
        value: { action: "milestone_reminder_mark_done", milestoneIds: ["m1"] },
      },
    },
  };

  assert.equal(getFeishuCallbackEventType(payload), "card.action.trigger");
  assert.deepEqual(getFeishuCardActionValue(payload), { action: "milestone_reminder_mark_done", milestoneIds: ["m1"] });
});

test("getFeishuCardActionValue parses stringified callback values", () => {
  const payload = {
    action: {
      value: JSON.stringify({ action: "mark_done", task_id: "m1" }),
    },
  };

  assert.deepEqual(getFeishuCardActionValue(payload), { action: "mark_done", task_id: "m1" });
});

test("getFeishuCallbackMessageId reads card callback message ids", () => {
  assert.equal(
    getFeishuCallbackMessageId({
      event: {
        context: {
          open_message_id: "om_1",
        },
      },
    }),
    "om_1"
  );
  assert.equal(getFeishuCallbackMessageId({ open_message_id: "om_2" }), "om_2");
});

test("buildFeishuCardCallbackAuditDetail keeps callback audit compact", () => {
  const detail = buildFeishuCardCallbackAuditDetail({
    header: { event_id: "evt_1" },
    event: {
      operator: { open_id: "ou_1" },
      context: { open_chat_id: "oc_1", open_message_id: "om_1" },
      action: {
        value: {
          action: "mark_done",
          projectIds: ["p1"],
          task_id: "m1",
        },
      },
    },
  });

  assert.deepEqual(detail, {
    eventId: "evt_1",
    action: "mark_done",
    chatId: "oc_1",
    messageId: "om_1",
    operatorOpenId: "ou_1",
    projectIds: ["p1"],
    milestoneIds: ["m1"],
  });
});
