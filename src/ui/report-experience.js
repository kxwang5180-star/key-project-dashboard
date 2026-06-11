function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey || "")
    .split("-")
    .map((part) => Number(part));
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatMonthDay(date) {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function getWeekRangeSummary({ startKey, endKey, selectedWeek }) {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  const week = Math.max(1, Number(selectedWeek) || 1);
  if (!start) return `第${week}周`;

  const weekStart = new Date(start);
  weekStart.setDate(start.getDate() + (week - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const cappedEnd = end && end < weekEnd ? end : weekEnd;

  return `第${week}周 · ${formatMonthDay(weekStart)}-${formatMonthDay(cappedEnd)}`;
}

export function getVisibleCalendarEvents(events, { expanded = false, limit = 3 } = {}) {
  const source = Array.isArray(events) ? events : [];
  if (expanded || source.length <= limit) {
    return { visible: source, hiddenCount: 0, isExpanded: Boolean(expanded) };
  }
  return {
    visible: source.slice(0, limit),
    hiddenCount: source.length - limit,
    isExpanded: false,
  };
}

export function getVisibleMilestones(milestones, { expanded = false, limit = 6, pinnedId = "" } = {}) {
  const source = Array.isArray(milestones) ? milestones : [];
  const safeLimit = Math.max(1, Number(limit) || 1);
  if (expanded || source.length <= safeLimit) {
    return { visible: source, hiddenCount: 0, isExpanded: Boolean(expanded) };
  }

  const visible = source.slice(0, safeLimit);
  const pinnedIndex = pinnedId ? source.findIndex((milestone) => milestone?.id === pinnedId) : -1;
  if (pinnedIndex >= safeLimit) {
    visible[visible.length - 1] = source[pinnedIndex];
  }

  return {
    visible,
    hiddenCount: source.length - visible.length,
    isExpanded: false,
  };
}

export function getMilestoneReportPreview(
  reports,
  { projectId, milestoneId, expanded = false, limit = 3 } = {}
) {
  const matched = (Array.isArray(reports) ? reports : [])
    .filter((report) => report.projectId === projectId && report.milestoneId === milestoneId)
    .sort((a, b) => {
      const weekDiff = (Number(b.week) || 0) - (Number(a.week) || 0);
      if (weekDiff) return weekDiff;
      return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    });
  const reportsToShow = expanded ? matched : matched.slice(0, limit);
  return {
    reports: reportsToShow,
    total: matched.length,
    hiddenCount: Math.max(0, matched.length - reportsToShow.length),
    isExpanded: Boolean(expanded),
  };
}

export function getNearestMilestone(milestones, now = new Date()) {
  const source = Array.isArray(milestones) ? milestones : [];
  const dated = source.filter((milestone) => milestone?.dateInfo?.date);
  if (dated.length) {
    return [...dated].sort((a, b) => {
      const aDistance = Math.abs(a.dateInfo.date - now);
      const bDistance = Math.abs(b.dateInfo.date - now);
      if (aDistance !== bDistance) return aDistance - bDistance;
      return a.dateInfo.date - b.dateInfo.date;
    })[0];
  }
  return source[0] || null;
}

export function getLatestProjectReport(reports, projectId) {
  return (Array.isArray(reports) ? reports : [])
    .filter((report) => report.projectId === projectId)
    .sort((a, b) => {
      const activityDiff = new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
      if (activityDiff) return activityDiff;
      return (Number(b.week) || 0) - (Number(a.week) || 0);
    })[0] || null;
}

export function formatProjectStageLabel(stage) {
  const labels = {
    PLANNED: "计划中",
    IN_PROGRESS: "推进中",
    COMPLETED: "已完成",
    PAUSED: "暂停",
    CANCELLED: "已取消",
  };
  const value = String(stage || "").trim();
  return labels[value] || labels[value.toUpperCase()] || value || "未填写";
}
