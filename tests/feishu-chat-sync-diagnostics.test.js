import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChatMemberCountUpdate,
  buildChatMemberFetchAttempts,
  buildEmptyMemberSyncWarning,
} from "../src/services/feishu-chat-sync-diagnostics.js";

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

test("buildChatMemberCountUpdate preserves existing count during chat-list-only sync", () => {
  assert.deepEqual(
    buildChatMemberCountUpdate({
      existingMemberCount: 8,
      resolvedMemberCount: 0,
      chatMemberCount: 0,
      includeMembers: false,
    }),
    { memberCount: 8 }
  );
});

test("buildChatMemberCountUpdate uses resolved count after member sync", () => {
  assert.deepEqual(
    buildChatMemberCountUpdate({
      existingMemberCount: 8,
      resolvedMemberCount: 3,
      chatMemberCount: 0,
      includeMembers: true,
    }),
    { memberCount: 3 }
  );
});

test("buildChatMemberFetchAttempts tries user token before tenant token for selected chat member sync", () => {
  assert.deepEqual(
    buildChatMemberFetchAttempts({
      userAccessToken: "user-token",
      tenantAccessToken: "tenant-token",
    }),
    [
      { token: "user-token", memberIdType: "open_id", label: "user:open_id" },
      { token: "user-token", memberIdType: "user_id", label: "user:user_id" },
      { token: "tenant-token", memberIdType: "open_id", label: "tenant:open_id" },
      { token: "tenant-token", memberIdType: "user_id", label: "tenant:user_id" },
    ]
  );
});
