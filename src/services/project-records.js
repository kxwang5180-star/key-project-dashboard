export function toPublicProjectBrief(project) {
  return {
    id: project.id,
    owner: project.ownerName || "未填写",
    overview: project.description || "",
    stage: project.stage || "PLANNED",
    changeSummary: project.changeSummary || "",
  };
}

export function buildProjectBriefUpdatePayload(brief) {
  return {
    ownerName: String(brief?.owner || "").trim(),
    description: String(brief?.overview || "").trim(),
  };
}

export function applyProjectBriefSnapshot(project, brief) {
  if (!project || !brief) return project;
  project.owner = String(brief.owner || "").trim() || project.owner || "未填写";
  project.overallText = String(brief.overview || "").trim() || project.overallText || "";
  if (brief.stage) project.stage = brief.stage;
  return project;
}

function formatDateKey(date) {
  if (!date) return "";
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toFrontendMilestoneStatus(status) {
  const value = String(status || "").toUpperCase();
  const statusMap = {
    PLANNED: "planned",
    IN_PROGRESS: "in-progress",
    COMPLETED: "completed",
    CHANGED: "changed",
    OVERDUE: "overdue",
    UPCOMING: "upcoming",
  };
  return statusMap[value] || "planned";
}

export function normalizeProjectMilestoneStatus(status) {
  const value = String(status || "").trim();
  const upperValue = value.toUpperCase();
  const statusMap = {
    planned: "PLANNED",
    doing: "IN_PROGRESS",
    "in-progress": "IN_PROGRESS",
    done: "COMPLETED",
    completed: "COMPLETED",
    changed: "CHANGED",
    overdue: "OVERDUE",
    upcoming: "UPCOMING",
  };
  return statusMap[value] || statusMap[value.toLowerCase()] || ([
    "PLANNED",
    "IN_PROGRESS",
    "COMPLETED",
    "CHANGED",
    "OVERDUE",
    "UPCOMING",
  ].includes(upperValue)
    ? upperValue
    : "PLANNED");
}

export function toPublicProjectMaintenanceState(project) {
  return {
    projectId: project.id,
    metrics: (project.metrics || []).map((metric) => ({
      id: metric.id,
      name: metric.name,
      current: metric.currentValue || "",
      target: metric.targetValue || "",
      observation: metric.observation || "",
      chartType: metric.chartType || "",
    })),
    milestones: (project.milestones || []).map((milestone) => ({
      id: milestone.id,
      title: milestone.title,
      raw: milestone.rawText || milestone.title,
      source: milestone.source || "项目维护",
      dateKey: formatDateKey(milestone.dueDate),
      status: toFrontendMilestoneStatus(milestone.status),
      changeNote: milestone.changeSummary || "",
    })),
  };
}
