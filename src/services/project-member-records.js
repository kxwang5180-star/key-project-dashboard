export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function resolveMemberId(member, fallbackPrefix = "") {
  const email = normalizeEmail(member.email);
  return member.memberId || member.feishuUserId || member.feishuOpenId || email || `${fallbackPrefix}-${member.name || "member"}`;
}

export function buildUserProjectMemberConditions(user) {
  if (!user) return [];
  const email = normalizeEmail(user.email);
  return [
    user.id ? { userId: user.id } : undefined,
    user.feishuUserId ? { feishuUserId: user.feishuUserId } : undefined,
    user.feishuOpenId ? { feishuOpenId: user.feishuOpenId } : undefined,
    user.feishuUnionId ? { feishuUnionId: user.feishuUnionId } : undefined,
    email ? { email } : undefined,
  ].filter(Boolean);
}

export function buildUserMembershipLinkWhere(user) {
  const conditions = buildUserProjectMemberConditions(user).filter((condition) => !condition.userId);
  if (!conditions.length) return null;
  return {
    userId: null,
    OR: conditions,
  };
}

export function chooseChatMemberSyncMembers({ storedMembers = [], liveMembers = [], preferLive = false } = {}) {
  const stored = Array.isArray(storedMembers) ? storedMembers : [];
  const live = Array.isArray(liveMembers) ? liveMembers : [];

  if (preferLive && live.length) {
    return {
      members: live,
      source: "live",
      shouldWrite: true,
    };
  }

  if (stored.length) {
    return {
      members: stored,
      source: "stored",
      shouldWrite: false,
    };
  }

  return {
    members: live,
    source: "live",
    shouldWrite: true,
  };
}

export function buildProjectMemberRecord(member, { projectId, matchedUserId = null }) {
  const memberId = resolveMemberId(member, projectId);
  const email = normalizeEmail(member.email);
  return {
    projectId,
    userId: matchedUserId || member.userId || null,
    feishuUserId: member.feishuUserId || (/^ou_/.test(memberId) ? null : member.memberId || null),
    feishuOpenId: member.feishuOpenId || (/^ou_/.test(memberId) ? memberId : null),
    feishuUnionId: member.feishuUnionId || null,
    memberId,
    name: member.name || "未命名成员",
    email: email || null,
  };
}

export function buildFeishuChatMemberRecord(member, { chatId, matchedUserId = null }) {
  const memberId = resolveMemberId(member, chatId);
  const email = normalizeEmail(member.email);
  return {
    chatId,
    memberId,
    userId: matchedUserId || member.userId || null,
    feishuUserId: member.feishuUserId || (/^ou_/.test(memberId) ? null : member.memberId || null),
    feishuOpenId: member.feishuOpenId || (/^ou_/.test(memberId) ? memberId : null),
    feishuUnionId: member.feishuUnionId || null,
    name: member.name || "未命名成员",
    email: email || null,
    avatarUrl: member.avatarUrl || null,
    raw: {
      member: member.rawMember || member.raw?.member || null,
      user: member.rawUser || member.raw?.user || null,
    },
  };
}
