import { prisma } from "../src/lib/prisma.js";
import { fetchTenantAccessToken, sendFeishuCardMessage } from "../src/lib/feishu.js";
import {
  buildMilestoneReminderCard,
  buildProjectScopedMilestoneReminderCards,
} from "../src/services/milestone-reminder-cards.js";
import { sortMilestoneReminderTargets } from "../src/services/milestone-reminders.js";

const DEFAULT_TODAY_PROJECT_KEYWORDS = ["飞书测试"];
const DEFAULT_TEST_BASE_URL = "http://172.20.180.157/#report";

function dateKeyInTimezone(date = new Date(), timezoneOffsetMinutes = 480) {
  const value = date instanceof Date ? date : new Date(date);
  const shifted = new Date(value.getTime() + timezoneOffsetMinutes * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseArgs(argv) {
  const date = argv.find((item) => item.startsWith("--date="))?.slice("--date=".length) || "";
  const projectNames = argv.find((item) => item.startsWith("--project-names="))?.slice("--project-names=".length) || "";
  const baseUrl = argv.find((item) => item.startsWith("--base-url="))?.slice("--base-url=".length) || "";
  return {
    send: argv.includes("--send"),
    today: argv.includes("--today"),
    fallbackOpen: argv.includes("--fallback-open"),
    chatId: argv.find((item) => item.startsWith("--chat-id="))?.slice("--chat-id=".length) || "",
    chatName: argv.find((item) => item.startsWith("--chat-name="))?.slice("--chat-name=".length) || "飞书机器人测试群",
    baseUrl: baseUrl || DEFAULT_TEST_BASE_URL,
    dateKey: date || dateKeyInTimezone(new Date()),
    projectKeywords: projectNames
      ? projectNames.split(",").map((item) => item.trim()).filter(Boolean)
      : DEFAULT_TODAY_PROJECT_KEYWORDS,
  };
}

async function findChat({ chatId, chatName }) {
  if (chatId) {
    return prisma.feishuChat.findUnique({
      where: { chatId },
      include: { members: { orderBy: { name: "asc" }, take: 20 } },
    });
  }
  return prisma.feishuChat.findFirst({
    where: { name: { contains: chatName } },
    orderBy: [{ lastSyncedAt: "desc" }, { name: "asc" }],
    include: { members: { orderBy: { name: "asc" }, take: 20 } },
  });
}

function buildSampleCard(chatId, baseUrl) {
  return buildMilestoneReminderCard(
    [
      {
        chatId,
        projectId: "project_test",
        projectName: "飞书机器人测试项目",
        businessLine: "测试",
        milestoneId: "milestone_test",
        milestoneTitle: "验证机器人卡片消息推送效果",
        dueDate: "2026-06-09",
        timing: "tomorrow",
        timingLabel: "明日到期",
      },
    ],
    {
      baseUrl,
      title: "飞书机器人测试提醒",
      subtitle: "1 个测试节点",
      template: "blue",
    }
  );
}

async function buildFallbackOpenMilestoneCard(chatId, args) {
  const milestone = await prisma.milestone.findFirst({
    where: {
      status: { not: "COMPLETED" },
      project: {
        isKeyProject: true,
      },
    },
    orderBy: [{ dueDate: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      title: true,
      dueDate: true,
      project: {
        select: {
          id: true,
          name: true,
          shortName: true,
          businessLine: true,
        },
      },
    },
  });
  if (!milestone) {
    throw new Error("未找到可用于回调测试的未完成里程碑");
  }
  const dueDate = milestone.dueDate ? dateKeyInTimezone(milestone.dueDate) : args.dateKey;
  return buildMilestoneReminderCard(
    [
      {
        chatId,
        projectId: milestone.project.id,
        projectName: milestone.project.shortName || milestone.project.name,
        businessLine: milestone.project.businessLine,
        milestoneId: milestone.id,
        milestoneTitle: milestone.title,
        dueDate,
        timing: "today",
        timingLabel: "回调测试",
      },
    ],
    {
      baseUrl: args.baseUrl,
      title: "重点项目里程碑回调测试",
      subtitle: "1 个真实节点，点击确认完成会写入数据库",
      template: "blue",
    }
  );
}

async function buildTodayMilestoneCards(chatId, args) {
  const dateStart = new Date(`${args.dateKey}T00:00:00.000Z`);
  const dateEnd = new Date(dateStart.getTime() + 24 * 60 * 60 * 1000);
  const projects = await prisma.project.findMany({
    where: {
      OR: args.projectKeywords.flatMap((keyword) => [
        { name: { contains: keyword } },
        { shortName: { contains: keyword } },
      ]),
      milestones: {
        some: {
          dueDate: { gte: dateStart, lt: dateEnd },
        },
      },
    },
    select: {
      id: true,
      name: true,
      shortName: true,
      businessLine: true,
      milestones: {
        where: {
          dueDate: { gte: dateStart, lt: dateEnd },
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
  const targets = sortMilestoneReminderTargets(projects.flatMap((project) =>
    project.milestones.map((milestone) => ({
      chatId,
      projectId: project.id,
      projectName: project.shortName || project.name,
      businessLine: project.businessLine,
      milestoneId: milestone.id,
      milestoneTitle: milestone.title,
      dueDate: args.dateKey,
      timing: "today",
      timingLabel: "今日到期",
    }))
  ));
  if (!targets.length) {
    throw new Error(`${args.dateKey} 未找到匹配项目的到期里程碑：${args.projectKeywords.join("、")}`);
  }
  return buildProjectScopedMilestoneReminderCards(targets, {
    baseUrl: args.baseUrl,
    title: "重点项目里程碑提醒",
    template: "orange",
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const chat = await findChat(args);
  if (!chat) {
    console.error(`未找到群聊：${args.chatId || args.chatName}。请先在页面点击“同步我的飞书群聊”，或传入 --chat-id=oc_xxx。`);
    process.exitCode = 1;
    return;
  }

  console.log(`群聊：${chat.name}`);
  console.log(`chat_id：${chat.chatId}`);
  console.log(`成员数：${chat.memberCount || chat.members.length}`);
  if (chat.members.length) {
    console.log(`成员预览：${chat.members.map((member) => member.name).filter(Boolean).slice(0, 10).join("、")}`);
  }

  let cards;
  try {
    cards = args.today
      ? await buildTodayMilestoneCards(chat.chatId, args)
      : [buildSampleCard(chat.chatId, args.baseUrl)];
  } catch (error) {
    if (!args.today || !args.fallbackOpen) throw error;
    console.warn(`${error.message}`);
    console.warn("改发一个数据库中未完成里程碑的回调测试卡片。");
    cards = [await buildFallbackOpenMilestoneCard(chat.chatId, args)];
  }
  if (!args.send) {
    console.log(JSON.stringify(cards, null, 2));
    return;
  }

  const tenantAccessToken = await fetchTenantAccessToken();
  for (const [index, card] of cards.entries()) {
    await sendFeishuCardMessage({
      receiveId: chat.chatId,
      tenantAccessToken,
      card,
      uuid: `test-card-${index}-${Date.now()}`.slice(0, 50),
    });
    console.log(`测试卡片已发送 ${index + 1}/${cards.length}`);
  }
}

main()
  .catch((error) => {
    console.error(`测试卡片发送失败：${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
