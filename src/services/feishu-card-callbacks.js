import { prisma } from "../lib/prisma.js";

export function normalizeCallbackMilestoneIds(value = {}) {
  return Array.isArray(value?.milestoneIds)
    ? value.milestoneIds.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
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
