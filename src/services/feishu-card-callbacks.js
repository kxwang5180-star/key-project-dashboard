import { prisma } from "../lib/prisma.js";

export function normalizeCallbackMilestoneIds(value = {}) {
  const source = Array.isArray(value?.milestoneIds)
    ? value.milestoneIds
    : [value?.task_id || value?.taskId || value?.milestoneId];
  return source.map((item) => String(item || "").trim()).filter(Boolean);
}

export function isMilestoneDoneAction(action) {
  return ["milestone_reminder_mark_done", "mark_done"].includes(String(action || "").trim());
}

export async function markMilestoneReminderDone({ client = prisma, milestoneIds = [] } = {}) {
  const ids = Array.isArray(milestoneIds) ? milestoneIds.map((item) => String(item || "").trim()).filter(Boolean) : [];
  if (!ids.length) return { count: 0 };
  return client.milestone.updateMany({
    where: {
      id: { in: ids },
      status: { not: "COMPLETED" },
    },
    data: {
      status: "COMPLETED",
      changeSummary: "通过飞书里程碑提醒卡片确认完成",
    },
  });
}
