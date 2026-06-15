const roleLabels = {
  ADMIN: "管理员",
  MEMBER: "项目成员",
};

const milestoneStatusToClient = {
  PLANNED: "planned",
  IN_PROGRESS: "in-progress",
  COMPLETED: "completed",
  CHANGED: "changed",
  OVERDUE: "overdue",
  UPCOMING: "upcoming",
};

const milestoneStatusFromClient = Object.fromEntries(
  Object.entries(milestoneStatusToClient).map(([serverValue, clientValue]) => [clientValue, serverValue])
);

const riskLevelToClient = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
};

const riskStatusToClient = {
  OPEN: "open",
  MITIGATING: "mitigating",
  CLOSED: "closed",
};

export function normalizeMilestoneState(value) {
  const raw = String(value || "").trim();
  return milestoneStatusFromClient[raw] || (milestoneStatusToClient[raw] ? raw : null);
}

export function normalizeReportWeekNumber(value) {
  const week = Number(value);
  if (!Number.isInteger(week) || week < 1 || week > 52) return null;
  return week;
}

export function hasMeaningfulReportProgress(text) {
  const lines = String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const meaningfulLines = lines.filter((line) => {
    const normalized = line
      .replace(/^第\d+周更新\s*[:：]?/, "")
      .replace(/^(已完成|进行中|下周计划|需要协调|阻塞点|预计恢复时间)\s*[:：]?\s*/, "")
      .replace(/[：:\s。；;，,、\-—]/g, "")
      .trim();
    return normalized.length >= 3;
  });
  return meaningfulLines.length > 0;
}

function toIsoDate(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function toIsoDateTime(value) {
  if (!value) return new Date().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function parseDateKey(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split("-").map((part) => Number(part));
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return date;
}

function milestoneStatusLabel(status) {
  const labels = {
    PLANNED: "计划中",
    IN_PROGRESS: "进行中",
    COMPLETED: "已完成",
    CHANGED: "变更",
    OVERDUE: "逾期",
    UPCOMING: "临近",
  };
  const value = String(status || "").trim();
  return labels[value] || value || "未填写";
}

export function parseReportMilestoneDate(value) {
  return parseDateKey(value);
}

export function buildRiskFromReport({ projectId, riskSummary, ownerName }) {
  const detail = String(riskSummary || "").trim();
  if (!detail || detail === "暂无") return null;
  return {
    projectId,
    title: "本周填报风险",
    detail,
    level: "MEDIUM",
    ownerName: ownerName || null,
    status: "OPEN",
    source: "成员填报",
  };
}

export function buildWeeklyReportLookup({ projectId, authorId, weekNumber, milestoneId = null }) {
  return {
    projectId: String(projectId || "").trim(),
    authorId: String(authorId || "").trim(),
    weekNumber,
    milestoneId: String(milestoneId || "").trim() || null,
  };
}

export function shouldCreateRiskForReportChange(existingReport, risk) {
  if (!risk?.detail) return false;
  const previousRisk = String(existingReport?.riskSummary || "").trim();
  return previousRisk !== risk.detail;
}

export function buildMilestoneUpdateFromReport(milestone, report) {
  if (!milestone) return null;
  const oldTitle = String(milestone.title || "").trim();
  const oldDate = toIsoDate(milestone.dueDate);
  const oldStatus = milestone.status || "PLANNED";
  const nextTitle = String(report.milestoneTitle || oldTitle).trim() || oldTitle;
  const reportDate = String(report.milestoneDate || "").trim();
  const nextDueDate = reportDate ? parseDateKey(reportDate) || milestone.dueDate || null : milestone.dueDate || null;
  const nextDate = toIsoDate(nextDueDate);
  const nextStatus = normalizeMilestoneState(report.milestoneState) || oldStatus;
  const changedParts = [];

  if (nextTitle !== oldTitle) changedParts.push(`名称由「${oldTitle}」调整为「${nextTitle}」`);
  if (nextDate !== oldDate) changedParts.push(`日期由${oldDate || "未填写"}调整为${nextDate || "未填写"}`);
  if (nextStatus !== oldStatus && !changedParts.length) changedParts.push(`状态由${milestoneStatusLabel(oldStatus)}调整为${milestoneStatusLabel(nextStatus)}`);
  if (!changedParts.length) return null;

  const existingChangeSummary = String(milestone.changeSummary || "").trim();
  return {
    title: nextTitle,
    rawText: nextTitle,
    dueDate: nextDueDate,
    status: nextStatus,
    changeSummary: changedParts.join("；") || existingChangeSummary || null,
  };
}

export function buildWeeklyReportDeleteAuditDetail(report) {
  return {
    projectId: report.projectId,
    weekNumber: report.weekNumber,
    authorId: report.authorId,
    hasRisk: Boolean(report.riskSummary),
    progressPreview: String(report.progress || "").slice(0, 80),
  };
}

export function toPublicWeeklyReport(report) {
  return {
    id: report.id,
    projectId: report.projectId,
    milestoneId: report.milestoneId || "",
    week: report.weekNumber,
    memberName: report.author?.name || "未知成员",
    memberRole: roleLabels[report.author?.role] || "项目成员",
    progress: report.progress || "",
    risk: report.riskSummary || "",
    milestoneTitle: report.milestoneTitle || "",
    milestoneDate: toIsoDate(report.milestoneDate),
    milestoneStatus: milestoneStatusToClient[report.milestoneState] || "planned",
    createdAt: toIsoDateTime(report.createdAt),
    updatedAt: toIsoDateTime(report.updatedAt || report.createdAt),
  };
}

export function toPublicProjectReportState(project) {
  return {
    projectId: project.id,
    milestones: (project.milestones || []).map((milestone) => ({
      id: milestone.id,
      title: milestone.title,
      raw: milestone.rawText || milestone.title,
      source: milestone.source || "项目维护",
      dateKey: toIsoDate(milestone.dueDate),
      status: milestoneStatusToClient[milestone.status] || "planned",
      changeNote: milestone.changeSummary || "",
    })),
    risks: (project.risks || []).map((risk) => ({
      id: risk.id,
      level: riskLevelToClient[risk.level] || "medium",
      title: risk.title,
      detail: risk.detail,
      owner: risk.ownerName || "",
      dueDate: toIsoDate(risk.dueDate),
      status: riskStatusToClient[risk.status] || "open",
      source: risk.source || "项目维护",
    })),
  };
}
