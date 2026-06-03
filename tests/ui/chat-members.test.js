import test from "node:test";
import assert from "node:assert/strict";
import { getMemberAvatarText, mergeChatMembers, renderChatMemberChips } from "../../src/ui/chat-members.js";

test("getMemberAvatarText uses the last two characters of a Chinese name", () => {
  assert.equal(getMemberAvatarText("王康旭"), "康旭");
});

test("renderChatMemberChips renders name chips without avatars", () => {
  const html = renderChatMemberChips([{ name: "王康旭" }, { name: "赵长硕" }]);

  assert.match(html, /<span class="chat-member-chip"[^>]*>王康旭<\/span>/);
  assert.match(html, /<span class="chat-member-chip"[^>]*>赵长硕<\/span>/);
  assert.doesNotMatch(html, /chat-member-avatar/);
});

test("renderChatMemberChips renders an expandable control for hidden members", () => {
  const members = [{ name: "王康旭" }, { name: "赵长硕" }, { name: "姚翔宇" }];
  const collapsed = renderChatMemberChips(members, { limit: 2, groupId: "project_1" });
  assert.match(collapsed, /data-toggle-chat-members="project_1"/);
  assert.match(collapsed, />\+1<\/button>/);
  assert.doesNotMatch(collapsed, /姚翔宇/);

  const expanded = renderChatMemberChips(members, { limit: 2, groupId: "project_1", expanded: true });
  assert.match(expanded, /姚翔宇/);
  assert.match(expanded, /data-toggle-chat-members="project_1"/);
  assert.match(expanded, />收起<\/button>/);
});

test("renderChatMemberChips renders an empty state for missing members", () => {
  assert.equal(renderChatMemberChips([]), '<p class="chat-member-empty">暂无成员信息</p>');
});

test("mergeChatMembers updates the selected chat member list and count", () => {
  const chats = [
    { chatId: "oc_1", name: "项目群", memberCount: 0, members: [] },
    { chatId: "oc_2", name: "其他群", memberCount: 3, members: [{ name: "李四" }] },
  ];

  const nextChats = mergeChatMembers(chats, "oc_1", [{ name: "王康旭" }, { name: "赵长硕" }]);

  assert.equal(nextChats[0].memberCount, 2);
  assert.deepEqual(
    nextChats[0].members.map((member) => member.name),
    ["王康旭", "赵长硕"]
  );
  assert.deepEqual(nextChats[1], chats[1]);
});
