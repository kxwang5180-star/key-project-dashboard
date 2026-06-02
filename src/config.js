import dotenv from "dotenv";

dotenv.config();

function required(key, fallback) {
  const value = process.env[key] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
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
    contactUsersUrl: "https://open.feishu.cn/open-apis/contact/v3/users",
    defaultChatId: process.env.FEISHU_CHAT_ID || "",
    postLoginRedirect: process.env.FEISHU_POST_LOGIN_REDIRECT || "/",
    allowAllUsers: String(process.env.FEISHU_ALLOW_ALL_USERS || "true").toLowerCase() === "true",
    scopes: String(process.env.FEISHU_SCOPES || "contact:user.base:readonly auth:user.id:read")
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean),
    allowedEmails: String(process.env.FEISHU_ALLOWED_EMAILS || "")
      .split(/[,\s]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
    adminEmails: String(process.env.FEISHU_ADMIN_EMAILS || "")
      .split(/[,\s]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  },
};
