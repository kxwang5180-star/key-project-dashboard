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

function dateKey(date) {
  if (!date) return "";
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  return value.toISOString().slice(0, 10);
}

export async function loadMilestoneReminderTargetsByIds({ client = prisma, milestoneIds = [] } = {}) {
  const ids = normalizeCallbackMilestoneIds({ milestoneIds });
  if (!ids.length) return [];
  const order = new Map(ids.map((id, index) => [id, index]));
  const milestones = await client.milestone.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      title: true,
      dueDate: true,
      status: true,
      project: {
        select: {
          id: true,
          name: true,
          shortName: true,
          businessLine: true,
          feishuChatId: true,
        },
      },
    },
  });

  return milestones
    .sort((left, right) => (order.get(left.id) ?? 9999) - (order.get(right.id) ?? 9999))
    .map((milestone) => ({
      chatId: milestone.project?.feishuChatId || "",
      projectId: milestone.project?.id || "",
      projectName: milestone.project?.shortName || milestone.project?.name || "未命名项目",
      businessLine: milestone.project?.businessLine || "",
      milestoneId: milestone.id,
      milestoneTitle: milestone.title,
      dueDate: dateKey(milestone.dueDate),
      timing: "completed",
      timingLabel: "已确认完成",
      completed: true,
    }));
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
