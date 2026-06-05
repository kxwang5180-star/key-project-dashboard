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

export function getMilestoneReportPreview(
  reports,
  { projectId, milestoneId, expanded = false, limit = 3 } = {}
) {
  const matched = (Array.isArray(reports) ? reports : [])
    .filter((report) => report.projectId === projectId && report.milestoneId === milestoneId)
    .sort((a, b) => {
      const weekDiff = (Number(b.week) || 0) - (Number(a.week) || 0);
      if (weekDiff) return weekDiff;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  const reportsToShow = expanded ? matched : matched.slice(0, limit);
  return {
    reports: reportsToShow,
    total: matched.length,
    hiddenCount: Math.max(0, matched.length - reportsToShow.length),
    isExpanded: Boolean(expanded),
  };
}
