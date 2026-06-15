export function buildWeeklyReportSaveNotice({ projectName = "项目", week = "", notification = null } = {}) {
  const base = `已保存 ${projectName} 第${week || "-"}周更新，已同步到服务端`;
  if (notification?.sent) return `${base}，已通知项目群`;
  if (notification?.skipped) return `${base}，未通知项目群：${notification.reason || "未满足发送条件"}`;
  if (notification && notification.skipped === false) return `${base}，群通知发送失败：${notification.reason || "请稍后重试"}`;
  return base;
}
