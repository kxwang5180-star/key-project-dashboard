export function buildEmptyMemberSyncWarning({ chatId, chatName, source, memberIdType }) {
  return {
    chatId,
    name: chatName || chatId,
    message: `成员接口返回 0 条记录（${source}，member_id_type=${memberIdType}）。请确认应用机器人已在该群内，且具备 im:chat.members:read 权限。`,
  };
}

export function buildChatMemberCountUpdate({ existingMemberCount = 0, resolvedMemberCount = 0, chatMemberCount = 0, includeMembers = false }) {
  if (includeMembers) {
    return { memberCount: resolvedMemberCount || Number(chatMemberCount || 0) };
  }
  return { memberCount: Math.max(Number(existingMemberCount || 0), Number(chatMemberCount || 0), resolvedMemberCount) };
}
