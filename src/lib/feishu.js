import { UserRole } from "@prisma/client";
import { config } from "../config.js";

function sanitizeRedirectPath(input) {
  const value = String(input || "").trim();
  if (!value.startsWith("/") || value.startsWith("//")) return config.feishu.postLoginRedirect;
  return value;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function buildFeishuAuthorizeUrl(stateValue) {
  const url = new URL(config.feishu.authorizeUrl);
  url.searchParams.set("client_id", config.feishu.appId);
  url.searchParams.set("redirect_uri", config.feishu.redirectUri);
  url.searchParams.set("scope", config.feishu.scopes.join(" "));
  url.searchParams.set("state", stateValue);
  return url.toString();
}

export async function exchangeFeishuCode(code) {
  const response = await fetch(config.feishu.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: config.feishu.appId,
      client_secret: config.feishu.appSecret,
      code,
      redirect_uri: config.feishu.redirectUri,
    }),
  });

  const data = await response.json();
  if (!response.ok || data.code !== 0 || !data.access_token) {
    throw new Error(data.message || data.msg || "Failed to exchange Feishu authorization code");
  }
  return data;
}

export async function fetchFeishuUserInfo(userAccessToken) {
  const response = await fetch(config.feishu.userInfoUrl, {
    headers: {
      Authorization: `Bearer ${userAccessToken}`,
    },
  });
  const data = await response.json();
  if (!response.ok || data.code !== 0 || !data.data) {
    throw new Error(data.message || data.msg || "Failed to fetch Feishu user info");
  }
  return data.data;
}

export function mapRoleFromFeishuUser(userInfo) {
  const email = normalizeEmail(userInfo.email);
  if (config.feishu.adminEmails.includes(email)) return UserRole.ADMIN;
  return UserRole.MEMBER;
}

export function assertFeishuUserAllowed(userInfo) {
  const email = normalizeEmail(userInfo.email);
  if (config.feishu.allowAllUsers) return;
  if (config.feishu.allowedEmails.includes(email)) return;
  throw new Error("当前飞书账号未被授权访问该系统");
}

export function getUserEmailOrFallback(userInfo) {
  const email = normalizeEmail(userInfo.email);
  if (email) return email;
  if (userInfo.union_id) return `feishu-${userInfo.union_id}@local.invalid`;
  if (userInfo.open_id) return `feishu-${userInfo.open_id}@local.invalid`;
  return `feishu-${Date.now()}@local.invalid`;
}

export function getSafeRedirectPath(rawStateValue) {
  return sanitizeRedirectPath(rawStateValue);
}
