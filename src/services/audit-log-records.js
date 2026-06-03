export function buildAuditLogRecord({ userId = null, action, targetType, targetId, detail = null }) {
  return {
    userId: userId || null,
    action: String(action || "").trim(),
    targetType: String(targetType || "").trim(),
    targetId: String(targetId || "").trim(),
    detail: detail == null ? null : JSON.stringify(detail),
  };
}

export function buildUserRoleAuditDetail({ role, defaultProjectId = null }) {
  return {
    role: String(role || "").trim(),
    defaultProjectId: String(defaultProjectId || "").trim() || null,
  };
}

export function buildProjectChatAuditDetail({ chatId, memberCount = null }) {
  return {
    chatId: String(chatId || "").trim(),
    memberCount: memberCount == null ? null : Number(memberCount),
  };
}

export function buildGovernanceAuditDetail({ status = null, ownerName = null }) {
  return {
    status: status == null ? null : String(status || "").trim(),
    ownerName: ownerName == null ? null : String(ownerName || "").trim() || null,
  };
}
