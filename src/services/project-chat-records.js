export function resolveProjectChatSelection({ project, requestedChatId = "", chat = null }) {
  if (!project) {
    return { ok: false, status: 404, message: "项目不存在" };
  }

  const chatId = String(requestedChatId || project.feishuChatId || "").trim();
  if (!chatId) {
    return { ok: false, status: 400, message: "请先配置项目群 chat_id" };
  }

  if (!chat) {
    return {
      ok: false,
      status: 400,
      message: "该群聊尚未同步，请先同步我的飞书群聊后再选择",
    };
  }

  return { ok: true, chatId };
}
