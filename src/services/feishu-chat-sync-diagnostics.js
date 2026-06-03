export function buildEmptyMemberSyncWarning({ chatId, chatName, source, memberIdType }) {
  return {
    chatId,
    name: chatName || chatId,
    message: `成员接口返回 0 条记录（${source}，member_id_type=${memberIdType}）。请确认应用机器人已在该群内，且具备 im:chat.members:read 权限。`,
  };
}

export function buildChatMemberFetchAttempts({ userAccessToken, tenantAccessToken }) {
  return [
    userAccessToken ? { token: userAccessToken, memberIdType: "open_id", label: "user:open_id" } : null,
    userAccessToken ? { token: userAccessToken, memberIdType: "user_id", label: "user:user_id" } : null,
    tenantAccessToken ? { token: tenantAccessToken, memberIdType: "open_id", label: "tenant:open_id" } : null,
    tenantAccessToken ? { token: tenantAccessToken, memberIdType: "user_id", label: "tenant:user_id" } : null,
  ].filter(Boolean);
}

export function buildChatMemberCountUpdate({ existingMemberCount = 0, resolvedMemberCount = 0, chatMemberCount = 0, includeMembers = false }) {
  if (includeMembers) {
    return { memberCount: resolvedMemberCount || Number(chatMemberCount || 0) };
  }
  return { memberCount: Math.max(Number(existingMemberCount || 0), Number(chatMemberCount || 0), resolvedMemberCount) };
}
