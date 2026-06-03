import test from "node:test";
import assert from "node:assert/strict";
import { buildEmptyMemberSyncWarning } from "../src/services/feishu-chat-sync-diagnostics.js";

test("buildEmptyMemberSyncWarning describes empty member responses with token source", () => {
  const warning = buildEmptyMemberSyncWarning({
    chatId: "oc_123",
    chatName: "项目周会群",
    source: "tenant:user_id",
    memberIdType: "user_id",
  });

  assert.deepEqual(warning, {
    chatId: "oc_123",
    name: "项目周会群",
    message:
      "成员接口返回 0 条记录（tenant:user_id，member_id_type=user_id）。请确认应用机器人已在该群内，且具备 im:chat.members:read 权限。",
  });
});
