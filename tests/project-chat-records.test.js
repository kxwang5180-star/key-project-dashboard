import test from "node:test";
import assert from "node:assert/strict";
import { resolveProjectChatSelection } from "../src/services/project-chat-records.js";

test("resolveProjectChatSelection requires an existing project", () => {
  assert.deepEqual(resolveProjectChatSelection({ project: null, requestedChatId: "oc_1", chat: { chatId: "oc_1" } }), {
    ok: false,
    status: 404,
    message: "项目不存在",
  });
});

test("resolveProjectChatSelection requires a configured or requested chat id", () => {
  assert.deepEqual(resolveProjectChatSelection({ project: { id: "project_1" }, requestedChatId: "", chat: null }), {
    ok: false,
    status: 400,
    message: "请先配置项目群 chat_id",
  });
});

test("resolveProjectChatSelection rejects unsynced chats", () => {
  assert.deepEqual(
    resolveProjectChatSelection({
      project: { id: "project_1", feishuChatId: "oc_old" },
      requestedChatId: "oc_new",
      chat: null,
    }),
    {
      ok: false,
      status: 400,
      message: "该群聊尚未同步，请先同步我的飞书群聊后再选择",
    }
  );
});

test("resolveProjectChatSelection returns the normalized selected chat id", () => {
  assert.deepEqual(
    resolveProjectChatSelection({
      project: { id: "project_1", feishuChatId: " oc_old " },
      requestedChatId: "",
      chat: { chatId: "oc_old" },
    }),
    {
      ok: true,
      chatId: "oc_old",
    }
  );
});
