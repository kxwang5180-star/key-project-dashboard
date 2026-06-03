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

function toIsoDate(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function toIsoDateTime(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
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

export function buildMilestoneUpdateFromReport(milestone, report) {
  if (!milestone) return null;
  const oldTitle = String(milestone.title || "").trim();
  const oldDate = toIsoDate(milestone.dueDate);
  const oldStatus = milestone.status || "PLANNED";
  const nextTitle = String(report.milestoneTitle || oldTitle).trim() || oldTitle;
  const nextDateKey = String(report.milestoneDate || oldDate).trim();
  const nextDueDate = nextDateKey ? new Date(`${nextDateKey}T00:00:00.000Z`) : null;
  const nextDate = toIsoDate(nextDueDate);
  const nextStatus = normalizeMilestoneState(report.milestoneState) || oldStatus;
  const changedParts = [];

  if (nextTitle !== oldTitle) changedParts.push(`名称由「${oldTitle}」调整为「${nextTitle}」`);
  if (nextDate !== oldDate) changedParts.push(`日期由${oldDate || "未填写"}调整为${nextDate || "未填写"}`);
  if (nextStatus !== oldStatus && !changedParts.length) changedParts.push(`状态由${oldStatus}调整为${nextStatus}`);
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
