function compactText(value, maxLength = 700) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}...`;
}

function projectName(project = {}) {
  return String(project.shortName || project.name || project.id || "未命名项目").trim();
}

function authorName(user = {}, report = {}) {
  return String(user.name || report.author?.name || "项目成员").trim();
}

export function buildWeeklyReportNotificationText({ project = {}, report = {}, user = {} } = {}) {
  const lines = [
    "【重点项目周度进展】",
    `项目：${projectName(project)}`,
    `周次：第${report.weekNumber || report.week || "-"}周`,
    `提交人：${authorName(user, report)}`,
  ];
  if (report.milestoneTitle) lines.push(`关联里程碑：${report.milestoneTitle}`);
  lines.push("", "本周进展：", compactText(report.progress || "暂无进展内容"));
  if (report.riskSummary) {
    lines.push("", "风险与支持：", compactText(report.riskSummary, 360));
  }
  return lines.join("\n");
}

export async function sendWeeklyReportProgressNotification({
  project = {},
  report = {},
  user = {},
  tenantAccessToken: providedTenantAccessToken = "",
} = {}) {
  const receiveId = String(project.feishuChatId || "").trim();
  if (!receiveId) {
    return { sent: false, skipped: true, reason: "项目未绑定飞书群聊" };
  }
  const { config } = await import("../config.js");
  if (!config.feishu.appId || !config.feishu.appSecret) {
    return { sent: false, skipped: true, reason: "飞书应用未配置，已跳过群通知" };
  }

  const { fetchTenantAccessToken, sendFeishuTextMessage } = await import("../lib/feishu.js");
  const tenantAccessToken = providedTenantAccessToken || await fetchTenantAccessToken();
  const text = buildWeeklyReportNotificationText({ project, report, user });
  const result = await sendFeishuTextMessage({
    receiveId,
    text,
    tenantAccessToken,
  });
  return {
    sent: true,
    skipped: false,
    receiveId,
    messageId: result.message_id || result.open_message_id || result.message?.message_id || "",
  };
}
