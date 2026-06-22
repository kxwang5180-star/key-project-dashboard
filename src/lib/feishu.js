import { config } from "../config.js";
import { mapRoleFromFeishuIdentity } from "../services/feishu-auth-records.js";

function sanitizeRedirectPath(input) {
  const value = String(input || "").trim();
  if (!value.startsWith("/") || value.startsWith("//")) return config.feishu.postLoginRedirect;
  return value;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function formatFeishuError(data, fallbackMessage) {
  const code = data?.code ?? data?.error ?? "";
  const message = data?.message || data?.msg || data?.error_description || fallbackMessage;
  return code ? `${message}（飞书错误码：${code}）` : message;
}

export const FEISHU_LOGIN_SCOPES = [
  "contact:user.base:readonly",
  "auth:user.id:read",
];

export function selectFeishuLoginScopes(scopes = config.feishu.scopes) {
  const requestedScopes = new Set(
    (Array.isArray(scopes) ? scopes : String(scopes || "").split(/[\s,]+/))
      .map((item) => String(item || "").trim())
      .filter(Boolean)
  );
  return FEISHU_LOGIN_SCOPES.filter((scope) => requestedScopes.size === 0 || requestedScopes.has(scope));
}

export function buildFeishuAuthorizeUrl(stateValue, scopes = config.feishu.scopes, options = {}) {
  const requestedScopes = options.allowExtendedScopes ? scopes : selectFeishuLoginScopes(scopes);
  const url = new URL(config.feishu.authorizeUrl);
  url.searchParams.set("client_id", config.feishu.appId);
  url.searchParams.set("redirect_uri", config.feishu.redirectUri);
  url.searchParams.set("scope", requestedScopes.join(" "));
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
    throw new Error(formatFeishuError(data, "Failed to exchange Feishu authorization code"));
  }
  return data;
}

export async function refreshFeishuUserAccessToken(refreshToken) {
  const response = await fetch(config.feishu.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: config.feishu.appId,
      client_secret: config.feishu.appSecret,
      refresh_token: refreshToken,
    }),
  });

  const data = await response.json();
  if (!response.ok || data.code !== 0 || !data.access_token) {
    throw new Error(formatFeishuError(data, "Failed to refresh Feishu user access token"));
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
    throw new Error(formatFeishuError(data, "Failed to fetch Feishu user info"));
  }
  return data.data;
}

export async function fetchFeishuUserChats(userAccessToken, options = {}) {
  const chats = [];
  let pageToken = "";
  const pageSize = options.pageSize || 100;
  const userIdType = options.userIdType || "open_id";

  do {
    const url = new URL(config.feishu.chatsUrl);
    url.searchParams.set("page_size", String(pageSize));
    url.searchParams.set("user_id_type", userIdType);
    if (pageToken) url.searchParams.set("page_token", pageToken);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${userAccessToken}`,
      },
    });
    const data = await parseFeishuResponse(response, "Failed to fetch Feishu user chats");
    const items = data.data?.items || [];
    chats.push(...items);
    pageToken = data.data?.page_token || "";
  } while (pageToken);

  return chats;
}

async function parseFeishuResponse(response, fallbackMessage) {
  const data = await response.json();
  if (!response.ok || data.code !== 0) {
    throw new Error(formatFeishuError(data, fallbackMessage));
  }
  return data;
}

export async function fetchTenantAccessToken() {
  const response = await fetch(config.feishu.tenantTokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      app_id: config.feishu.appId,
      app_secret: config.feishu.appSecret,
    }),
  });

  const data = await parseFeishuResponse(response, "Failed to fetch Feishu tenant access token");
  if (!data.tenant_access_token) throw new Error("Feishu tenant access token is empty");
  return data.tenant_access_token;
}

export async function fetchFeishuChatMembers(chatId, tenantAccessToken, options = {}) {
  const members = [];
  let pageToken = "";
  const pageSize = options.pageSize || 100;
  const memberIdType = options.memberIdType || "user_id";

  do {
    const url = new URL(`${config.feishu.chatMembersUrl}/${encodeURIComponent(chatId)}/members`);
    url.searchParams.set("page_size", String(pageSize));
    url.searchParams.set("member_id_type", memberIdType);
    if (pageToken) url.searchParams.set("page_token", pageToken);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${tenantAccessToken}`,
      },
    });
    const data = await parseFeishuResponse(response, "Failed to fetch Feishu chat members");
    const items = data.data?.items || [];
    members.push(...items);
    pageToken = data.data?.page_token || "";
  } while (pageToken);

  return members;
}

export async function fetchFeishuContactUser(userId, tenantAccessToken, options = {}) {
  const userIdType = options.userIdType || "user_id";
  const departmentIdType = options.departmentIdType || "open_department_id";
  const url = new URL(`${config.feishu.contactUsersUrl}/${encodeURIComponent(userId)}`);
  url.searchParams.set("user_id_type", userIdType);
  url.searchParams.set("department_id_type", departmentIdType);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${tenantAccessToken}`,
    },
  });
  const data = await parseFeishuResponse(response, "Failed to fetch Feishu contact user");
  return data.data?.user || null;
}

export async function sendFeishuTextMessage({ receiveId, text, tenantAccessToken, receiveIdType = "chat_id" }) {
  const target = String(receiveId || "").trim();
  const content = String(text || "").trim();
  if (!target) throw new Error("Missing Feishu message receive_id");
  if (!content) throw new Error("Missing Feishu message content");

  const url = new URL(config.feishu.messagesUrl);
  url.searchParams.set("receive_id_type", receiveIdType);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tenantAccessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      receive_id: target,
      msg_type: "text",
      content: JSON.stringify({ text: content }),
    }),
  });
  const data = await parseFeishuResponse(response, "Failed to send Feishu message");
  return data.data || {};
}

export async function sendFeishuCardMessage({ receiveId, card, tenantAccessToken, receiveIdType = "chat_id", uuid = "" }) {
  const target = String(receiveId || "").trim();
  if (!target) throw new Error("Missing Feishu message receive_id");
  if (!card || typeof card !== "object") throw new Error("Missing Feishu card content");

  const url = new URL(config.feishu.messagesUrl);
  url.searchParams.set("receive_id_type", receiveIdType);
  const body = {
    receive_id: target,
    msg_type: "interactive",
    content: JSON.stringify(card),
  };
  const dedupeId = String(uuid || "").trim();
  if (dedupeId) body.uuid = dedupeId.slice(0, 50);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tenantAccessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const data = await parseFeishuResponse(response, "Failed to send Feishu card message");
  return data.data || {};
}

export async function updateFeishuCardMessage({ messageId, card, tenantAccessToken }) {
  const target = String(messageId || "").trim();
  if (!target) throw new Error("Missing Feishu message_id");
  if (!card || typeof card !== "object") throw new Error("Missing Feishu card content");

  const url = new URL(`${config.feishu.messagesUrl}/${encodeURIComponent(target)}`);
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${tenantAccessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      content: JSON.stringify(card),
    }),
  });
  const data = await parseFeishuResponse(response, "Failed to update Feishu card message");
  return data.data || {};
}

export async function fetchFeishuChatMemberNames(chatId, options = {}) {
  if (!chatId) throw new Error("Missing Feishu chat_id");
  const tenantAccessToken = await fetchTenantAccessToken();
  const members = await fetchFeishuChatMembers(chatId, tenantAccessToken, options);

  const result = [];
  for (const member of members) {
    const memberId = member.member_id || member.user_id || member.open_id || "";
    let contactUser = null;
    if (memberId) {
      try {
        contactUser = await fetchFeishuContactUser(memberId, tenantAccessToken, {
          userIdType: options.memberIdType || "user_id",
        });
      } catch (error) {
        if (!options.ignoreUserDetailErrors) throw error;
      }
    }

    result.push({
      memberId,
      name: contactUser?.name || member.name || member.member_name || "",
      email: contactUser?.email || member.email || "",
      mobile: contactUser?.mobile || "",
      rawMember: member,
      rawUser: contactUser,
    });
  }

  return result;
}

export function mapRoleFromFeishuUser(userInfo) {
  return mapRoleFromFeishuIdentity(userInfo, config.feishu);
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
