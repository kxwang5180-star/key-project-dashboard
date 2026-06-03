function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function getMemberAvatarText(name) {
  const normalized = String(name || "").trim();
  if (!normalized) return "?";
  return Array.from(normalized).slice(-2).join("");
}

export function normalizeChatMembers(members) {
  return (Array.isArray(members) ? members : [])
    .map((member) => ({
      memberId: member.memberId || member.id || member.email || member.name || "",
      name: String(member.name || "").trim(),
      email: member.email || "",
      userId: member.userId || null,
    }))
    .filter((member) => member.name);
}

export function renderChatMemberChips(members, options = {}) {
  const limit = Number(options.limit || 12);
  const normalized = normalizeChatMembers(members);
  if (!normalized.length) return '<p class="chat-member-empty">暂无成员信息</p>';
  const visibleMembers = normalized.slice(0, limit);
  const hiddenCount = Math.max(normalized.length - visibleMembers.length, 0);
  return `
    <div class="chat-member-strip">
      ${visibleMembers
        .map(
          (member) => `
            <span class="chat-member-chip" title="${escapeHtml(member.name)}">${escapeHtml(member.name)}</span>
          `
        )
        .join("")}
      ${hiddenCount ? `<span class="chat-member-more">+${hiddenCount}</span>` : ""}
    </div>
  `;
}

export function mergeChatMembers(chats, chatId, members) {
  const normalized = normalizeChatMembers(members);
  if (!chatId || !normalized.length) return Array.isArray(chats) ? chats : [];
  return (Array.isArray(chats) ? chats : []).map((chat) =>
    chat.chatId === chatId
      ? {
          ...chat,
          members: normalized,
          memberCount: normalized.length,
        }
      : chat
  );
}
