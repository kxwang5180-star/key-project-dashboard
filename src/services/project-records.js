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

function parseMetricRecordDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
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

export function buildProjectMetricCreateData(metric, { projectId, index = 0 }) {
  const history = Array.isArray(metric?.history) ? metric.history : [];
  const records = history
    .map((item) => ({
      recordDate: parseMetricRecordDate(item.date),
      value: String(item.value || "").trim(),
    }))
    .filter((item) => item.recordDate && item.value)
    .slice(-8);

  const metricId = String(metric?.id || "").trim();
  const data = {
    projectId,
    name: String(metric?.name || `指标 ${index + 1}`).trim(),
    currentValue: String(metric?.currentValue || metric?.current || "").trim() || null,
    targetValue: String(metric?.targetValue || metric?.target || "").trim() || null,
    observation: String(metric?.observation || "").trim() || null,
    chartType: String(metric?.chartType || "").trim() || null,
    sortOrder: index,
  };

  if (metricId) data.id = metricId;

  if (records.length) {
    data.records = {
      createMany: {
        data: records,
      },
    };
  }

  return data;
}

export function buildProjectMilestoneCreateData(milestone, { projectId, index = 0 }) {
  const milestoneId = String(milestone?.id || "").trim();
  const dueDate = milestone?.dueDate ? parseDateKey(formatDateKey(milestone.dueDate)) : parseDateKey(milestone?.dateKey);
  const data = {
    projectId,
    title: String(milestone?.title || `里程碑 ${index + 1}`).trim(),
    source: String(milestone?.source || "项目维护").trim(),
    rawText: String(milestone?.rawText || milestone?.raw || "").trim() || null,
    dueDate,
    status: normalizeProjectMilestoneStatus(milestone?.status),
    sortOrder: index,
    changeSummary: String(milestone?.changeSummary || milestone?.changeNote || "").trim() || null,
  };
  if (milestoneId) data.id = milestoneId;
  return data;
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
      history: (metric.records || []).map((record) => ({
        date: formatDateKey(record.recordDate),
        value: record.value || "",
      })),
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
