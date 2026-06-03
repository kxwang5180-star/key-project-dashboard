export function buildEmptyMemberSyncWarning({ chatId, chatName, source, memberIdType }) {
  return {
    chatId,
    name: chatName || chatId,
    message: `成员接口返回 0 条记录（${source}，member_id_type=${memberIdType}）。请确认应用机器人已在该群内，且具备 im:chat.members:read 权限。`,
  };
}
