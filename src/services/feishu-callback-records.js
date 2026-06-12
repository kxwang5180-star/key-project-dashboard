export function getFeishuCallbackEventType(payload = {}) {
  return String(payload?.header?.event_type || payload?.event_type || payload?.type || "").trim();
}

export function getFeishuCallbackToken(payload = {}) {
  return String(payload?.header?.token || payload?.token || "").trim();
}

export function resolveFeishuChallengeResponse(payload = {}) {
  const type = getFeishuCallbackEventType(payload);
  const challenge = String(payload?.challenge || "").trim();
  if (type !== "url_verification" || !challenge) return null;
  return { challenge };
}

export function verifyFeishuCallbackToken(payload = {}, expectedToken = "") {
  const token = String(expectedToken || "").trim();
  if (!token) return { ok: true, skipped: true };
  return {
    ok: getFeishuCallbackToken(payload) === token,
    skipped: false,
  };
}

export function getFeishuCardActionValue(payload = {}) {
  const value = payload?.event?.action?.value || payload?.action?.value || {};
  if (typeof value !== "string") return value || {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getFeishuCallbackMessageId(payload = {}) {
  return String(
    payload?.event?.context?.open_message_id ||
      payload?.event?.context?.message_id ||
      payload?.event?.open_message_id ||
      payload?.event?.message_id ||
      payload?.open_message_id ||
      payload?.message_id ||
      ""
  ).trim();
}

export function buildFeishuCardCallbackAuditDetail(payload = {}) {
  const value = getFeishuCardActionValue(payload);
  return {
    eventId: String(payload?.header?.event_id || payload?.event_id || "").trim() || null,
    action: String(value?.action || "").trim() || null,
    chatId: String(payload?.event?.context?.open_chat_id || payload?.context?.open_chat_id || value?.chatId || "").trim() || null,
    messageId: getFeishuCallbackMessageId(payload) || null,
    operatorOpenId: String(payload?.event?.operator?.open_id || payload?.operator?.open_id || "").trim() || null,
    projectIds: Array.isArray(value?.projectIds) ? value.projectIds : [],
    milestoneIds: Array.isArray(value?.milestoneIds) ? value.milestoneIds : [value?.task_id || value?.taskId || value?.milestoneId].filter(Boolean),
  };
}
