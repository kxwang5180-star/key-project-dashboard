const DEFAULT_ADMIN_NAMES = ["王康旭", "赵长硕", "姚翔宇"];
const FEISHU_APP_PERMISSION_PATTERN = /(没有|无).*(使用权限|应用权限)|access_denied|permission/i;

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

export function buildFeishuAuthFailureMessage(error, errorDescription) {
  const raw = String(errorDescription || error || "未知错误").trim();
  if (FEISHU_APP_PERMISSION_PATTERN.test(raw)) {
    return "飞书授权失败：当前账号没有该飞书应用的使用权限。请在飞书管理后台把该用户或所在部门加入应用可用范围/发布范围，发布后重新登录。";
  }
  return `飞书授权失败：${raw}`;
}
