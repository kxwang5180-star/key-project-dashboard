import { buildProjectMaintenanceHash } from "../ui/project-links.js";
import { isMilestoneDoneAction, normalizeCallbackMilestoneIds } from "./feishu-card-callbacks.js";

const CARD_MAX_TARGETS = 8;

function compactText(value, maxLength) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function plainText(content) {
  return {
    tag: "plain_text",
    content: String(content || ""),
  };
}

function markdown(content) {
  return {
    tag: "lark_md",
    content: String(content || ""),
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

function button({ text, type = "default", value, url, disabled = false }) {
  const actionButton = {
    tag: "button",
    type,
    text: plainText(text),
  };
  if (value && typeof value === "object") actionButton.value = value;
  if (url) actionButton.url = url;
  if (disabled) actionButton.disabled = true;
  return actionButton;
}

function buildMilestoneRow(target, index = 0) {
  const projectInfo = [
    target.businessLine ? `业务线：${target.businessLine}` : "",
    target.completed ? "状态：已完成 ✅" : "",
  ].filter(Boolean);
  const content = [
    `**${index + 1}. ${compactText(target.projectName, 28)}**`,
    compactText(target.milestoneTitle, 96),
    `${target.dueDate}${projectInfo.length ? `｜${projectInfo.join("｜")}` : ""}`,
  ].join("\n");
  return {
    tag: "div",
    text: markdown(content),
  };
}

function groupTargetsByTiming(targets) {
  return targets.reduce((groups, target) => {
    const key = target.timingLabel || "到期提醒";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(target);
    return groups;
  }, new Map());
}

export function buildMilestoneReminderCard(targets = [], options = {}) {
  const completedMilestoneIds = new Set((options.completedMilestoneIds || []).map((item) => String(item || "").trim()).filter(Boolean));
  const items = (Array.isArray(targets) ? targets.slice(0, CARD_MAX_TARGETS) : []).map((target) => ({
    ...target,
    completed: Boolean(target?.completed || completedMilestoneIds.has(String(target?.milestoneId || "").trim())),
  }));
  const hiddenCount = Math.max(0, (Array.isArray(targets) ? targets.length : 0) - items.length);
  const baseUrl = options.baseUrl || "";
  const title = options.title || "重点项目里程碑提醒";
  const subtitle = options.subtitle || `${items.length} 个节点需要关注`;
  const allCompleted = Boolean(items.length && items.every((item) => item.completed));
  const template = options.template || (allCompleted ? "green" : "orange");
  const firstTarget = items[0] || {};
  const projectUrl = buildProjectUrl(baseUrl, firstTarget.projectId);

  const elements = [
    {
      tag: "div",
      text: markdown(`**${subtitle}**\n请关注以下重点项目里程碑，并在项目维护页及时更新节点进展。`),
    },
  ];

  let rowIndex = 0;
  for (const [label, groupItems] of groupTargetsByTiming(items).entries()) {
    elements.push({
      tag: "div",
      text: markdown(`**${label}**`),
    });
    elements.push(...groupItems.map((target) => buildMilestoneRow(target, rowIndex++)));
  }

  if (hiddenCount) {
    elements.push({
      tag: "div",
      text: markdown(`另有 ${hiddenCount} 个里程碑未在本卡片中展开，请进入项目看板查看。`),
    });
  }

  const actions = [];
  if (projectUrl) {
    actions.push(button({
      text: "去维护",
      type: "default",
      url: projectUrl,
    }));
  }

  if (actions.length) {
    elements.push({
      tag: "action",
      actions,
    });
  }

  return {
    config: {
      wide_screen: true,
      update_multi: true,
    },
    elements,
    header: {
      title: plainText(title),
      template,
    },
  };
}

export function buildMilestoneReminderCards(targets = [], options = {}) {
  const items = Array.isArray(targets) ? targets : [];
  const cards = [];
  for (let index = 0; index < items.length; index += CARD_MAX_TARGETS) {
    cards.push(buildMilestoneReminderCard(items.slice(index, index + CARD_MAX_TARGETS), options));
  }
  return cards;
}

export function buildProjectScopedMilestoneReminderCards(targets = [], options = {}) {
  const items = Array.isArray(targets) ? targets : [];
  const projectGroups = items.reduce((groups, target) => {
    const key = String(target?.projectId || target?.projectName || "unknown").trim() || "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(target);
    return groups;
  }, new Map());
  return [...projectGroups.values()].map((projectTargets) => buildMilestoneReminderCard(projectTargets, {
    ...options,
    subtitle: options.subtitle || `${projectTargets.length} 个节点需要关注`,
  }));
}

export function buildMilestoneReminderCallbackResponse(value = {}) {
  const action = String(value?.action || "").trim();
  if (!isMilestoneDoneAction(action)) {
    return {
      toast: {
        type: "warning",
        content: "暂不支持该操作",
      },
    };
  }
  return {
    toast: {
      type: "success",
      content: "已确认完成",
    },
    card: buildMilestoneReminderCard(Array.isArray(value.targets) ? value.targets : [], {
      baseUrl: value.baseUrl || "",
      title: value.title || "重点项目里程碑提醒",
      subtitle: value.subtitle || `${Array.isArray(value.targets) ? value.targets.length : 0} 个节点需要关注`,
      template: value.template || "green",
      completedMilestoneIds: normalizeCallbackMilestoneIds(value),
    }),
  };
}
