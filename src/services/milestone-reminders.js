const SKIPPED_MILESTONE_STATUSES = new Set(["COMPLETED", "completed", "done"]);
const TIMING_ORDER = ["tomorrow", "today", "catchup"];
const DEFAULT_TIMEZONE_OFFSET_MINUTES = 8 * 60;
const DEFAULT_MAX_MESSAGE_CHARS = 3200;

function toDateKey(date, timezoneOffsetMinutes = 0) {
  if (!date) return "";
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  const shifted = new Date(value.getTime() + timezoneOffsetMinutes * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysInTimezone(date, days, timezoneOffsetMinutes = DEFAULT_TIMEZONE_OFFSET_MINUTES) {
  const value = date instanceof Date ? date : new Date(date);
  const shifted = new Date(value.getTime() + timezoneOffsetMinutes * 60 * 1000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + days));
}

function isWeekendDateKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function isWorkdayDateKey(dateKey) {
  return !isWeekendDateKey(dateKey);
}

function normalizeProjectName(project) {
  return String(project?.shortName || project?.name || "未命名项目").trim();
}

function compactText(value, maxLength) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function shouldRemindMilestone(milestone) {
  if (!milestone?.dueDate) return false;
  return !SKIPPED_MILESTONE_STATUSES.has(String(milestone.status || "").trim());
}

export function getMilestoneReminderWindow(now = new Date(), options = {}) {
  const timezoneOffsetMinutes = options.timezoneOffsetMinutes ?? DEFAULT_TIMEZONE_OFFSET_MINUTES;
  const todayKey = toDateKey(now, timezoneOffsetMinutes);
  const items = [
    { timing: "tomorrow", label: "明日到期", dateKey: toDateKey(addDaysInTimezone(now, 1, timezoneOffsetMinutes)) },
    { timing: "today", label: "今日到期", dateKey: todayKey },
  ];
  if (isWorkdayDateKey(todayKey)) {
    for (let offset = 1; offset <= 3; offset += 1) {
      const previousKey = toDateKey(addDaysInTimezone(now, -offset, timezoneOffsetMinutes));
      if (!isWeekendDateKey(previousKey)) break;
      items.push({ timing: "catchup", label: "非工作日到期", dateKey: previousKey });
    }
  }
  return items.sort((left, right) => {
    const timingDelta = TIMING_ORDER.indexOf(left.timing) - TIMING_ORDER.indexOf(right.timing);
    if (timingDelta) return timingDelta;
    return left.dateKey.localeCompare(right.dateKey);
  });
}

export function getMilestoneReminderDateRange(now = new Date(), options = {}) {
  const windowItems = getMilestoneReminderWindow(now, options);
  const dates = windowItems.map((item) => new Date(`${item.dateKey}T00:00:00.000Z`));
  if (!dates.length) return { minDate: null, maxDate: null, dateKeys: [] };
  return {
    minDate: new Date(Math.min(...dates.map((date) => date.getTime()))),
    maxDate: new Date(Math.max(...dates.map((date) => date.getTime()))),
    dateKeys: windowItems.map((item) => item.dateKey),
  };
}

export function buildMilestoneReminderTargets(projects = [], now = new Date(), options = {}) {
  const timezoneOffsetMinutes = options.timezoneOffsetMinutes ?? DEFAULT_TIMEZONE_OFFSET_MINUTES;
  const windowItems = getMilestoneReminderWindow(now, { timezoneOffsetMinutes });
  const dateLookup = new Map(windowItems.map((item) => [item.dateKey, item]));
  const targets = [];

  for (const project of Array.isArray(projects) ? projects : []) {
    const chatId = String(project?.feishuChatId || "").trim();
    if (!chatId) continue;

    for (const milestone of Array.isArray(project?.milestones) ? project.milestones : []) {
      if (!shouldRemindMilestone(milestone)) continue;
      const dateKey = toDateKey(milestone.dueDate, timezoneOffsetMinutes);
      const timing = dateLookup.get(dateKey);
      if (!timing) continue;
      targets.push({
        chatId,
        projectId: project.id || "",
        projectName: normalizeProjectName(project),
        businessLine: String(project.businessLine || "").trim(),
        milestoneId: milestone.id || "",
        milestoneTitle: String(milestone.title || "未命名里程碑").trim(),
        dueDate: dateKey,
        timing: timing.timing,
        timingLabel: timing.label,
      });
    }
  }

  return sortMilestoneReminderTargets(targets);
}

export function groupMilestoneReminderTargets(targets = []) {
  return (Array.isArray(targets) ? targets : []).reduce((groups, target) => {
    const chatId = String(target?.chatId || "").trim();
    if (!chatId) return groups;
    if (!groups.has(chatId)) groups.set(chatId, []);
    groups.get(chatId).push(target);
    return groups;
  }, new Map());
}

export function sortMilestoneReminderTargets(targets = []) {
  return [...(Array.isArray(targets) ? targets : [])].sort((left, right) => {
    const timingDelta = TIMING_ORDER.indexOf(left.timing) - TIMING_ORDER.indexOf(right.timing);
    if (timingDelta) return timingDelta;
    return `${left.projectName}${left.dueDate}${left.milestoneTitle}`.localeCompare(
      `${right.projectName}${right.dueDate}${right.milestoneTitle}`,
      "zh-Hans-CN"
    );
  });
}

export function getMilestoneReminderAction(target) {
  const timing = String(target?.timing || "").trim() || "unknown";
  return `milestone.reminder.${timing}`;
}

export function getMilestoneReminderTargetId(target) {
  const milestoneId = String(target?.milestoneId || "").trim();
  if (milestoneId) return milestoneId;
  return [
    String(target?.projectId || "").trim(),
    String(target?.dueDate || "").trim(),
    String(target?.timing || "").trim(),
    String(target?.milestoneTitle || "").trim(),
  ].join(":");
}

export function buildMilestoneReminderText(targets = []) {
  const items = sortMilestoneReminderTargets(targets);
  if (!items.length) return "";
  const groupedByTiming = items.reduce((groups, item) => {
    const label = item.timingLabel || "到期提醒";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(item);
    return groups;
  }, new Map());

  const lines = ["重点项目里程碑提醒"];
  for (const [label, groupItems] of groupedByTiming.entries()) {
    lines.push("", label);
    for (const item of groupItems) {
      lines.push(`- ${compactText(item.projectName, 28)}｜${compactText(item.milestoneTitle, 86)}（${item.dueDate}）`);
    }
  }
  lines.push("", "请项目负责人及时更新节点进展，如已完成请在项目维护页同步状态。");
  return lines.join("\n");
}

export function buildMilestoneReminderMessages(targets = [], options = {}) {
  const maxChars = options.maxChars || DEFAULT_MAX_MESSAGE_CHARS;
  const items = sortMilestoneReminderTargets(targets);
  const messages = [];
  let current = [];

  for (const item of items) {
    const next = [...current, item];
    const text = buildMilestoneReminderText(next);
    if (current.length && text.length > maxChars) {
      messages.push(buildMilestoneReminderText(current));
      current = [item];
    } else {
      current = next;
    }
  }

  if (current.length) messages.push(buildMilestoneReminderText(current));
  return messages;
}
