import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFeishuChatMemberRecord,
  buildProjectMemberRecord,
  chooseChatMemberSyncMembers,
  buildUserMembershipLinkWhere,
  buildUserProjectMemberConditions,
} from "../src/services/project-member-records.js";

test("buildProjectMemberRecord normalizes ids and email for project permission matching", () => {
  const record = buildProjectMemberRecord(
    {
      memberId: "ou_123",
      name: "王康旭",
      email: " WANG@example.COM ",
      feishuOpenId: "ou_123",
      feishuUnionId: "on_456",
      userId: "user_1",
    },
    {
      projectId: "project_1",
      matchedUserId: "user_1",
    }
  );

  assert.deepEqual(record, {
    projectId: "project_1",
    userId: "user_1",
    feishuUserId: null,
    feishuOpenId: "ou_123",
    feishuUnionId: "on_456",
    memberId: "ou_123",
    name: "王康旭",
    email: "wang@example.com",
  });
});

test("buildFeishuChatMemberRecord preserves synced members for later chat list display", () => {
  const record = buildFeishuChatMemberRecord(
    {
      memberId: "u_123",
      name: "赵长硕",
      email: "zhao@example.com",
      feishuUserId: "u_123",
      userId: "user_2",
      rawMember: { member_id: "u_123" },
      rawUser: { name: "赵长硕" },
    },
    {
      chatId: "oc_1",
      matchedUserId: "user_2",
    }
  );

  assert.deepEqual(record, {
    chatId: "oc_1",
    memberId: "u_123",
    userId: "user_2",
    feishuUserId: "u_123",
    feishuOpenId: null,
    feishuUnionId: null,
    name: "赵长硕",
    email: "zhao@example.com",
    avatarUrl: null,
    raw: {
      member: { member_id: "u_123" },
      user: { name: "赵长硕" },
    },
  });
});

test("buildUserProjectMemberConditions builds stable permission matching conditions", () => {
  const conditions = buildUserProjectMemberConditions({
    id: "user_1",
    feishuUserId: "u_123",
    feishuOpenId: "ou_123",
    feishuUnionId: "on_123",
    email: " USER@example.COM ",
  });

  assert.deepEqual(conditions, [
    { userId: "user_1" },
    { feishuUserId: "u_123" },
    { feishuOpenId: "ou_123" },
    { feishuUnionId: "on_123" },
    { email: "user@example.com" },
  ]);
});

test("buildUserProjectMemberConditions omits empty identity fields", () => {
  assert.deepEqual(buildUserProjectMemberConditions({ email: " " }), []);
});

test("buildUserMembershipLinkWhere builds a reusable unlinked member matcher", () => {
  const where = buildUserMembershipLinkWhere({
    id: "user_1",
    feishuUserId: "u_123",
    feishuOpenId: "ou_123",
    feishuUnionId: "on_123",
    email: " USER@example.COM ",
  });

  assert.deepEqual(where, {
    userId: null,
    OR: [
      { feishuUserId: "u_123" },
      { feishuOpenId: "ou_123" },
      { feishuUnionId: "on_123" },
      { email: "user@example.com" },
    ],
  });
});

test("buildUserMembershipLinkWhere returns null without Feishu or email identity", () => {
  assert.equal(buildUserMembershipLinkWhere({ id: "user_1", email: " " }), null);
});

test("chooseChatMemberSyncMembers prefers fresh live members when available", () => {
  const result = chooseChatMemberSyncMembers({
    storedMembers: [{ memberId: "old", name: "旧成员" }],
    liveMembers: [{ memberId: "new", name: "新成员" }],
    preferLive: true,
  });

  assert.deepEqual(result, {
    members: [{ memberId: "new", name: "新成员" }],
    source: "live",
    shouldWrite: true,
  });
});

test("chooseChatMemberSyncMembers keeps cached members when live sync returns empty", () => {
  const result = chooseChatMemberSyncMembers({
    storedMembers: [{ memberId: "old", name: "旧成员" }],
    liveMembers: [],
    preferLive: true,
  });

  assert.deepEqual(result, {
    members: [{ memberId: "old", name: "旧成员" }],
    source: "stored",
    shouldWrite: false,
  });
});
