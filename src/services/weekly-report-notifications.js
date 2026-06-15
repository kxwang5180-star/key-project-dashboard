import { buildProjectMaintenanceHash } from "../ui/project-links.js";

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

function plainText(content) {
  return {
    tag: "plain_text",
    content: String(content || ""),
  };
}

function markdown(content, options = {}) {
  return {
    tag: "markdown",
    element_id: options.elementId || "md_text",
    content: String(content || ""),
    text_align: "left",
    text_size: options.textSize || "normal_v2",
    margin: options.margin || "0px 0px 0px 0px",
  };
}

function buildProjectUrl(baseUrl, projectId) {
  const root = String(baseUrl || "").trim();
  const id = String(projectId || "").trim();
  if (!root || !id) return "";
  const url = new URL(root);
  url.hash = buildProjectMaintenanceHash(id);
  return url.toString();
}

function openUrlBehavior(url) {
  return {
    type: "open_url",
    default_url: url,
    pc_url: url,
    android_url: url,
    ios_url: url,
  };
}

function button({ text, type = "default", behaviors, elementId }) {
  const actionButton = {
    tag: "button",
    element_id: elementId || "btn_open",
    type,
    size: "medium",
    text: plainText(text),
  };
  if (behaviors?.length) actionButton.behaviors = behaviors;
  return actionButton;
}

function buttonColumn(actionButton, options = {}) {
  return {
    tag: "column",
    element_id: options.elementId || "col_open",
    width: "auto",
    elements: [actionButton],
    padding: "0px 0px 0px 0px",
    vertical_align: "top",
  };
}

function infoBlock(lines = [], elementId = "row_info") {
  return {
    tag: "column_set",
    element_id: elementId,
    background_style: "grey",
    horizontal_spacing: "8px",
    columns: [
      {
        tag: "column",
        element_id: `${elementId}_col`,
        width: "weighted",
        elements: lines.map((line, index) => markdown(line, {
          elementId: `${elementId}_md_${index}`,
          margin: index ? "4px 0px 0px 0px" : "0px 0px 0px 0px",
          textSize: index ? "normal_v2" : "normal_v2",
        })),
        padding: "8px 8px 8px 8px",
        vertical_spacing: "4px",
        vertical_align: "top",
      },
    ],
    margin: "6px 0px 0px 0px",
  };
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

export function buildWeeklyReportNotificationCard({
  project = {},
  report = {},
  user = {},
  baseUrl = "",
} = {}) {
  const name = projectName(project);
  const weekNumber = report.weekNumber || report.week || "-";
  const reporter = authorName(user, report);
  const milestoneTitle = String(report.milestoneTitle || "").trim();
  const progress = compactText(report.progress || "暂无进展内容", 560);
  const riskSummary = compactText(report.riskSummary || "", 360);
  const projectUrl = buildProjectUrl(baseUrl, project.id);

  const elements = [
    markdown("项目成员已提交本周更新，请关注进展、风险与里程碑状态。", {
      elementId: "md_intro",
      margin: "0px 0px 8px 0px",
    }),
    infoBlock([
      `**${compactText(name, 32)}**`,
      `第${weekNumber}周｜提交人：${reporter}${milestoneTitle ? `｜关联里程碑：${compactText(milestoneTitle, 42)}` : ""}`,
    ], "row_summary"),
    markdown("**本周进展**", { elementId: "md_progress_title", margin: "10px 0px 0px 0px" }),
    infoBlock([progress], "row_progress"),
  ];

  if (riskSummary) {
    elements.push(
      markdown("**风险与支持**", { elementId: "md_risk_title", margin: "10px 0px 0px 0px" }),
      infoBlock([riskSummary], "row_risk"),
    );
  }

  const actions = [];
  if (projectUrl) {
    actions.push(button({
      text: "去维护",
      type: "default",
      behaviors: [openUrlBehavior(projectUrl)],
      elementId: "btn_open",
    }));
  }

  if (actions.length) {
    elements.push({
      tag: "column_set",
      element_id: "row_actions",
      flex_mode: "flow",
      background_style: "default",
      horizontal_spacing: "8px",
      columns: actions.map((actionButton, index) => buttonColumn(actionButton, { elementId: `col_act_${index}` })),
      margin: "12px 0px 0px 0px",
    });
  }

  return {
    schema: "2.0",
    config: {
      update_multi: true,
      style: {
        text_size: {
          normal_v2: {
            default: "normal",
            pc: "normal",
            mobile: "heading",
          },
        },
      },
    },
    body: {
      elements,
    },
    header: {
      title: plainText("重点项目周度进展"),
      subtitle: plainText(`${name} · 第${weekNumber}周`),
      template: "green",
    },
  };
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

  const { fetchTenantAccessToken, sendFeishuCardMessage } = await import("../lib/feishu.js");
  const tenantAccessToken = providedTenantAccessToken || await fetchTenantAccessToken();
  const card = buildWeeklyReportNotificationCard({
    project,
    report,
    user,
    baseUrl: config.feishu.publicBaseUrl,
  });
  const result = await sendFeishuCardMessage({
    receiveId,
    card,
    tenantAccessToken,
  });
  return {
    sent: true,
    skipped: false,
    receiveId,
    messageType: "interactive",
    cardTemplate: "green",
    messageId: result.message_id || result.open_message_id || result.message?.message_id || "",
  };
}
