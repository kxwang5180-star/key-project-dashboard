import dotenv from "dotenv";

dotenv.config();

function required(key, fallback) {
  const value = process.env[key] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function splitEnvList(value) {
  return String(value || "")
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export const config = {
  port: Number(process.env.PORT || 3000),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  databaseUrl: required("DATABASE_URL"),
  cookieSecure: String(process.env.COOKIE_SECURE || "false").toLowerCase() === "true",
  admin: {
    name: process.env.ADMIN_NAME || "系统管理员",
    email: process.env.ADMIN_EMAIL || "admin@example.com",
    password: process.env.ADMIN_PASSWORD || "ChangeMe123!",
  },
  feishu: {
    enabled: Boolean(process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET && process.env.FEISHU_REDIRECT_URI),
    appId: process.env.FEISHU_APP_ID || "",
    appSecret: process.env.FEISHU_APP_SECRET || "",
    redirectUri: process.env.FEISHU_REDIRECT_URI || "",
    authorizeUrl: "https://accounts.feishu.cn/open-apis/authen/v1/authorize",
    tokenUrl: "https://open.feishu.cn/open-apis/authen/v2/oauth/token",
    userInfoUrl: "https://open.feishu.cn/open-apis/authen/v1/user_info",
    tenantTokenUrl: "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    chatsUrl: "https://open.feishu.cn/open-apis/im/v1/chats",
    chatMembersUrl: "https://open.feishu.cn/open-apis/im/v1/chats",
    messagesUrl: "https://open.feishu.cn/open-apis/im/v1/messages",
    contactUsersUrl: "https://open.feishu.cn/open-apis/contact/v3/users",
    defaultChatId: process.env.FEISHU_CHAT_ID || "",
    publicBaseUrl: process.env.PUBLIC_BASE_URL || "",
    callbackVerificationToken: process.env.FEISHU_CALLBACK_VERIFICATION_TOKEN || "",
    postLoginRedirect: process.env.FEISHU_POST_LOGIN_REDIRECT || "/",
    allowAllUsers: String(process.env.FEISHU_ALLOW_ALL_USERS || "true").toLowerCase() === "true",
    scopes: String(process.env.FEISHU_SCOPES || "contact:user.base:readonly auth:user.id:read")
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean),
    chatSyncScopes: String(process.env.FEISHU_CHAT_SYNC_SCOPES || "im:chat:read im:chat.members:read")
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean),
    allowedEmails: splitEnvList(process.env.FEISHU_ALLOWED_EMAILS).map((item) => item.toLowerCase()),
    adminEmails: splitEnvList(process.env.FEISHU_ADMIN_EMAILS).map((item) => item.toLowerCase()),
    adminNames: splitEnvList(process.env.FEISHU_ADMIN_NAMES || ""),
    identityAdminNames: splitEnvList(process.env.FEISHU_IDENTITY_ADMIN_NAMES || ""),
    identityAdminEmails: splitEnvList(process.env.FEISHU_IDENTITY_ADMIN_EMAILS).map((item) => item.toLowerCase()),
    adminOpenIds: splitEnvList(process.env.FEISHU_ADMIN_OPEN_IDS),
    adminUnionIds: splitEnvList(process.env.FEISHU_ADMIN_UNION_IDS),
    adminUserIds: splitEnvList(process.env.FEISHU_ADMIN_USER_IDS),
  },
};
