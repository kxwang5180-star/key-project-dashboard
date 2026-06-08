import { prisma } from "../src/lib/prisma.js";
import { fetchTenantAccessToken, sendFeishuCardMessage, sendFeishuTextMessage } from "../src/lib/feishu.js";
import { buildMilestoneReminderCards } from "../src/services/milestone-reminder-cards.js";
import {
  buildMilestoneReminderMessages,
  buildMilestoneReminderTargets,
  getMilestoneReminderAction,
  getMilestoneReminderTargetId,
  getMilestoneReminderWindow,
  groupMilestoneReminderTargets,
} from "../src/services/milestone-reminders.js";

function dateFromKey(dateKey) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function localDateKeyToUtcStart(dateKey, timezoneOffsetMinutes) {
  return new Date(dateFromKey(dateKey).getTime() - timezoneOffsetMinutes * 60 * 1000);
}

function parseArgs(argv) {
  return {
    send: argv.includes("--send"),
    text: argv.includes("--text"),
    now: argv.find((item) => item.startsWith("--now="))?.slice("--now=".length) || "",
    maxChars: Number(argv.find((item) => item.startsWith("--max-chars="))?.slice("--max-chars=".length) || 3200),
    baseUrl: argv.find((item) => item.startsWith("--base-url="))?.slice("--base-url=".length) || process.env.PUBLIC_BASE_URL || "",
    timezoneOffsetMinutes: Number(
      argv.find((item) => item.startsWith("--timezone-offset-minutes="))?.slice("--timezone-offset-minutes=".length) ||
        process.env.MILESTONE_REMINDER_TIMEZONE_OFFSET_MINUTES ||
        480
    ),
  };
}

async function loadProjectsForReminder(now, options = {}) {
  const windowItems = getMilestoneReminderWindow(now, options);
  const dates = windowItems.map((item) => dateFromKey(item.dateKey));
  const minDate = new Date(Math.min(...dates.map((date) => date.getTime())));
  const maxDate = new Date(Math.max(...dates.map((date) => date.getTime())));

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
      action: { in: ["milestone.reminder.today", "milestone.reminder.tomorrow"] },
      targetType: "milestone",
      targetId: { in: targetIds },
      createdAt: { gte: dayStart },
    },
    select: { action: true, targetId: true },
  });
  const sentKeys = new Set(sentLogs.map((log) => `${log.action}:${log.targetId}`));
  return targets.filter((target) => !sentKeys.has(`${getMilestoneReminderAction(target)}:${getMilestoneReminderTargetId(target)}`));
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
  const args = parseArgs(process.argv.slice(2));
  const now = args.now ? new Date(args.now) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("--now 必须是有效日期");
  if (!Number.isFinite(args.timezoneOffsetMinutes)) throw new Error("--timezone-offset-minutes 必须是数字");
  if (!Number.isFinite(args.maxChars) || args.maxChars < 500) throw new Error("--max-chars 必须是不小于 500 的数字");

  const reminderOptions = { timezoneOffsetMinutes: args.timezoneOffsetMinutes };
  const projects = await loadProjectsForReminder(now, reminderOptions);
  const rawTargets = buildMilestoneReminderTargets(projects, now, reminderOptions);
  const targets = args.send ? await filterAlreadySentTargets(rawTargets, now, reminderOptions) : rawTargets;
  const grouped = groupMilestoneReminderTargets(targets);
  const tenantAccessToken = args.send ? await fetchTenantAccessToken() : "";

  if (!targets.length) {
    console.log("没有需要提醒的里程碑");
    return;
  }

  const failures = [];
  for (const [chatId, chatTargets] of grouped.entries()) {
    const payloads = args.text
      ? buildMilestoneReminderMessages(chatTargets, { maxChars: args.maxChars }).map((text) => ({ type: "text", text }))
      : buildMilestoneReminderCards(chatTargets, { baseUrl: args.baseUrl }).map((card) => ({ type: "card", card }));
    for (const [index, payload] of payloads.entries()) {
      if (args.send) {
        try {
          if (payload.type === "text") {
            await sendFeishuTextMessage({ receiveId: chatId, text: payload.text, tenantAccessToken });
          } else {
            await sendFeishuCardMessage({
              receiveId: chatId,
              card: payload.card,
              tenantAccessToken,
              uuid: buildMessageUuid(chatTargets, index),
            });
          }
          console.log(`已发送第 ${index + 1}/${payloads.length} 段里程碑提醒到 ${chatId}`);
        } catch (error) {
          failures.push({ chatId, message: error.message });
          console.error(`发送到 ${chatId} 失败：${error.message}`);
          continue;
        }
      } else {
        console.log(`[dry-run] ${chatId} ${index + 1}/${payloads.length}\n${JSON.stringify(payload.card || { text: payload.text }, null, 2)}\n`);
      }
    }
    if (args.send && !failures.some((failure) => failure.chatId === chatId)) {
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
