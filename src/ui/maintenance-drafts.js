export function updateMetricDraftField(metrics, { metricId, field, value }) {
  return (Array.isArray(metrics) ? metrics : []).map((metric) =>
    metric.id === metricId ? { ...metric, [field]: value } : metric
  );
}

export function updateMilestoneDraftField(milestones, { milestoneId, field, value }) {
  return (Array.isArray(milestones) ? milestones : []).map((milestone) => {
    const base = { ...milestone };
    const dateKey = String(milestone.dateKey || milestone.dateInfo?.key || "").trim();
    if (dateKey) base.dateKey = dateKey;
    if (milestone.id !== milestoneId) return base;
    const next = { ...base, [field]: value };
    if (field === "title") next.raw = value;
    return next;
  });
}

export function buildFocusedMilestonePatch(formValues, fallback = {}) {
  const title = String(formValues?.title || fallback.title || "").trim();
  const dateKey = String(formValues?.dateKey || fallback.dateKey || "").trim();
  const status = String(formValues?.status || fallback.status || "planned").trim();
  return {
    title,
    raw: title,
    dateKey,
    status,
  };
}

export function replaceFocusedMilestone(milestones, { milestoneId, patch }) {
  return (Array.isArray(milestones) ? milestones : []).map((milestone) => {
    const dateKey = String(milestone.dateKey || milestone.dateInfo?.key || "").trim();
    const base = dateKey ? { ...milestone, dateKey } : { ...milestone };
    return milestone.id === milestoneId ? { ...base, ...patch } : base;
  });
}

export function getMilestoneCalendarSource({
  projectId,
  reportProjectId,
  isManagingMilestones,
  projectMilestones,
  draftMilestones,
}) {
  if (isManagingMilestones && projectId === reportProjectId && Array.isArray(draftMilestones)) {
    return draftMilestones;
  }
  return Array.isArray(projectMilestones) ? projectMilestones : [];
}
