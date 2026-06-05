const DEFAULT_ADMIN_NAMES = ["王康旭", "赵长硕", "姚翔宇"];

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeList(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeFeishuAdminName(name) {
  return String(name || "").replace(/\s+/g, "").trim();
}

export function mapRoleFromFeishuIdentity(userInfo = {}, adminConfig = {}) {
  const email = normalizeEmail(userInfo.email);
  const name = normalizeFeishuAdminName(userInfo.name);
  const adminEmails = normalizeList(adminConfig.adminEmails).map(normalizeEmail);
  const adminNames = [...normalizeList(adminConfig.adminNames), ...DEFAULT_ADMIN_NAMES].map(normalizeFeishuAdminName);

  if (email && adminEmails.includes(email)) return "ADMIN";
  if (name && adminNames.includes(name)) return "ADMIN";
  if (userInfo.open_id && normalizeList(adminConfig.adminOpenIds).includes(userInfo.open_id)) return "ADMIN";
  if (userInfo.union_id && normalizeList(adminConfig.adminUnionIds).includes(userInfo.union_id)) return "ADMIN";
  if (userInfo.user_id && normalizeList(adminConfig.adminUserIds).includes(userInfo.user_id)) return "ADMIN";
  return "MEMBER";
}
