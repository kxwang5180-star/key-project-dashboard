import { prisma } from "../src/lib/prisma.js";
import { fetchTenantAccessToken, sendFeishuCardMessage, sendFeishuTextMessage } from "../src/lib/feishu.js";
import { buildMilestoneReminderCards } from "../src/services/milestone-reminder-cards.js";
import {
  buildMilestoneReminderMessages,
  buildMilestoneReminderTargets,
  filterReminderTargetsBySentLogs,
  getMilestoneReminderAction,
  getMilestoneReminderDateRange,
  getMilestoneReminderTargetId,
  getMilestoneReminderWindow,
  groupMilestoneReminderTargets,
} from "../src/services/milestone-reminders.js";
import {
  filterProjectsByReminderKeywords,
  parseMilestoneReminderArgs,
  resolveReminderReceiveId,
  shouldWriteReminderSentLogs,
} from "../src/services/milestone-reminder-preview.js";

function dateFromKey(dateKey) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function localDateKeyToUtcStart(dateKey, timezoneOffsetMinutes) {
  return new Date(dateFromKey(dateKey).getTime() - timezoneOffsetMinutes * 60 * 1000);
}

async function loadProjectsForReminder(now, options = {}) {
  const { minDate, maxDate } = getMilestoneReminderDateRange(now, options);
  if (!minDate || !maxDate) return [];

  return prisma.project.findMany({
    where: {
      feishuChatId: { not: null },
      milestones: {
        some: {
          dueDate: { gte: minDate, lte: maxDate },
        },
      },
    },
    select: {
      id: true,
      name: true,
      shortName: true,
      businessLine: true,
      feishuChatId: true,
      milestones: {
        where: {
          dueDate: { gte: minDate, lte: maxDate },
        },
        orderBy: [{ dueDate: "asc" }, { sortOrder: "asc" }],
        select: {
          id: true,
          title: true,
          dueDate: true,
          status: true,
        },
      },
    },
  });
}

async function findPreviewChat(args) {
  if (args.previewChatId) {
    return prisma.feishuChat.findUnique({
      where: { chatId: args.previewChatId },
      select: { chatId: true, name: true },
    });
  }
  if (!args.previewChatName) return null;
  return prisma.feishuChat.findFirst({
    where: { name: { contains: args.previewChatName } },
    orderBy: [{ lastSyncedAt: "desc" }, { name: "asc" }],
    select: { chatId: true, name: true },
  });
}

function buildMessageUuid(targets, index) {
  const source = (Array.isArray(targets) ? targets : [])
    .map((target) => getMilestoneReminderTargetId(target))
    .join("|");
  return `ms-${index}-${source}`.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50);
}

async function filterAlreadySentTargets(targets, now, options = {}) {
  const timezoneOffsetMinutes = options.timezoneOffsetMinutes ?? 480;
  const todayKey = getMilestoneReminderWindow(now, { timezoneOffsetMinutes }).find((item) => item.timing === "today").dateKey;
  const dayStart = localDateKeyToUtcStart(todayKey, timezoneOffsetMinutes);
  const targetIds = targets.map((target) => getMilestoneReminderTargetId(target)).filter(Boolean);
  if (!targetIds.length) return targets;
  const sentLogs = await prisma.auditLog.findMany({
    where: {
      action: { in: ["milestone.reminder.today", "milestone.reminder.tomorrow", "milestone.reminder.catchup"] },
      targetType: "milestone",
      targetId: { in: targetIds },
      createdAt: { gte: dayStart },
    },
    select: { action: true, targetId: true },
  });
  return filterReminderTargetsBySentLogs(targets, sentLogs);
}

async function markTargetsSent(targets) {
  if (!targets.length) return;
  await prisma.auditLog.createMany({
    data: targets.map((target) => ({
      action: getMilestoneReminderAction(target),
      targetType: "milestone",
      targetId: getMilestoneReminderTargetId(target),
      detail: JSON.stringify({
        chatId: target.chatId,
        projectId: target.projectId,
        projectName: target.projectName,
        milestoneTitle: target.milestoneTitle,
        dueDate: target.dueDate,
      }),
    })),
  });
}

async function main() {
  const args = parseMilestoneReminderArgs(process.argv.slice(2));
  const now = args.now ? new Date(args.now) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("--now 必须是有效日期");
  if (!Number.isFinite(args.timezoneOffsetMinutes)) throw new Error("--timezone-offset-minutes 必须是数字");
  if (!Number.isFinite(args.maxChars) || args.maxChars < 500) throw new Error("--max-chars 必须是不小于 500 的数字");
  const previewChat = await findPreviewChat(args);
  if ((args.previewChatId || args.previewChatName) && !previewChat) {
    throw new Error(`未找到预览测试群：${args.previewChatId || args.previewChatName}`);
  }
  if (previewChat) {
    args.previewChatId = previewChat.chatId;
    console.log(`预览模式：真实提醒卡片将发送到测试群「${previewChat.name}」(${previewChat.chatId})，不会写入已发送记录`);
  }

  const reminderOptions = { timezoneOffsetMinutes: args.timezoneOffsetMinutes };
  const projects = filterProjectsByReminderKeywords(
    await loadProjectsForReminder(now, reminderOptions),
    args.projectKeywords
  );
  const rawTargets = buildMilestoneReminderTargets(projects, now, reminderOptions);
  const targets = args.includeSent ? rawTargets : await filterAlreadySentTargets(rawTargets, now, reminderOptions);
  const grouped = groupMilestoneReminderTargets(targets);
  const tenantAccessToken = args.send ? await fetchTenantAccessToken() : "";

  if (!targets.length) {
    console.log("没有需要提醒的里程碑");
    return;
  }

  const failures = [];
  for (const [chatId, chatTargets] of grouped.entries()) {
    const receiveId = resolveReminderReceiveId(chatId, args);
    const payloads = args.text
      ? buildMilestoneReminderMessages(chatTargets, { maxChars: args.maxChars }).map((text) => ({ type: "text", text }))
      : buildMilestoneReminderCards(chatTargets, { baseUrl: args.baseUrl }).map((card) => ({ type: "card", card }));
    for (const [index, payload] of payloads.entries()) {
      if (args.send) {
        try {
          if (payload.type === "text") {
            await sendFeishuTextMessage({ receiveId, text: payload.text, tenantAccessToken });
          } else {
            await sendFeishuCardMessage({
              receiveId,
              card: payload.card,
              tenantAccessToken,
              uuid: previewChat ? `preview-${Date.now()}-${index}` : buildMessageUuid(chatTargets, index),
            });
          }
          console.log(`已发送第 ${index + 1}/${payloads.length} 段里程碑提醒到 ${receiveId}${previewChat ? `（原项目群：${chatId}）` : ""}`);
        } catch (error) {
          failures.push({ chatId: receiveId, message: error.message });
          console.error(`发送到 ${receiveId} 失败：${error.message}`);
          continue;
        }
      } else {
        console.log(`[dry-run] ${receiveId}${previewChat ? `（原项目群：${chatId}）` : ""} ${index + 1}/${payloads.length}\n${JSON.stringify(payload.card || { text: payload.text }, null, 2)}\n`);
      }
    }
    if (shouldWriteReminderSentLogs(args) && !failures.some((failure) => failure.chatId === chatId)) {
      await markTargetsSent(chatTargets);
    }
  }

  if (failures.length) {
    console.error(`里程碑提醒存在 ${failures.length} 个群发送失败，其余群已继续处理`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(`里程碑提醒发送失败：${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
