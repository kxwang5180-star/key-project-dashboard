import { buildProjectMaintenanceHash } from "../ui/project-links.js";

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

function button({ text, type = "default", behaviors, elementId, disabled = false }) {
  const actionButton = {
    tag: "button",
    element_id: elementId || "btn_open",
    type,
    size: "medium",
    text: plainText(text),
  };
  if (behaviors?.length) actionButton.behaviors = behaviors;
  if (disabled) actionButton.disabled = true;
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

function buildMilestoneRow(target, index = 0) {
  const projectInfo = [
    target.businessLine ? `业务线：${target.businessLine}` : "",
    target.completed ? "状态：已完成 ✅" : "",
  ].filter(Boolean);
  const columns = [
    {
      tag: "column",
      element_id: `col_ms_${index}`,
      width: "weighted",
      elements: [
        markdown(`**${compactText(target.projectName, 28)}**`, { elementId: `md_project_${index}`, margin: "0px 0px 4px 0px" }),
        markdown(compactText(target.milestoneTitle, 96), { elementId: `md_title_${index}` }),
        markdown(`${target.dueDate}${projectInfo.length ? `｜${projectInfo.join("｜")}` : ""}`, { elementId: `md_date_${index}`, textSize: "notation" }),
      ],
      padding: "8px 8px 8px 8px",
      vertical_spacing: "4px",
      vertical_align: "top",
    },
  ];
  return {
    tag: "column_set",
    element_id: `row_ms_${index}`,
    background_style: "grey",
    horizontal_spacing: "8px",
    columns,
    margin: "6px 0px 0px 0px",
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
    markdown("请关注以下重点项目里程碑，并在项目维护页及时更新节点进展。", { elementId: "md_intro", margin: "0px 0px 8px 0px" }),
  ];

  let rowIndex = 0;
  for (const [label, groupItems] of groupTargetsByTiming(items).entries()) {
    elements.push(markdown(`**${label}**`, { elementId: `md_group_${rowIndex}`, margin: "8px 0px 0px 0px" }));
    elements.push(...groupItems.map((target) => buildMilestoneRow(target, rowIndex++)));
  }

  if (hiddenCount) {
    elements.push(markdown(`另有 ${hiddenCount} 个里程碑未在本卡片中展开，请进入项目看板查看。`, { elementId: "md_hidden", margin: "8px 0px 0px 0px" }));
  }

  const markDoneValue = {
    action: "milestone_reminder_mark_done",
    baseUrl,
    title,
    subtitle,
    template: "green",
    projectIds: [...new Set(items.map((item) => item.projectId).filter(Boolean))],
    milestoneIds: items.map((item) => item.milestoneId).filter(Boolean),
    targets: items,
  };
  const actions = [];
  if (items.length) {
    actions.push(button({
      text: allCompleted ? "已完成 ✅" : "确认完成",
      type: allCompleted ? "default" : "primary",
      behaviors: allCompleted ? [] : [{ type: "callback", value: markDoneValue }],
      disabled: allCompleted,
      elementId: "btn_done",
    }));
  }
  if (projectUrl) {
    actions.push(button({
        text: "去维护",
        type: "default",
        behaviors: [openUrlBehavior(projectUrl)],
        elementId: "btn_open",
      }));
  }

  elements.push({
    tag: "column_set",
    element_id: "row_actions",
    flex_mode: "flow",
    background_style: "default",
    horizontal_spacing: "8px",
    columns: actions.map((actionButton, index) => buttonColumn(actionButton, { elementId: `col_act_${index}` })),
    margin: "12px 0px 0px 0px",
  });

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
      title: plainText(title),
      subtitle: plainText(subtitle),
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
  if (action !== "milestone_reminder_mark_done") {
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
      completedMilestoneIds: value.milestoneIds || [],
    }),
  };
}
