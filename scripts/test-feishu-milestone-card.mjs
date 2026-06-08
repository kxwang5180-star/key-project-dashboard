import { prisma } from "../src/lib/prisma.js";
import { fetchTenantAccessToken, sendFeishuCardMessage } from "../src/lib/feishu.js";
import { buildMilestoneReminderCard } from "../src/services/milestone-reminder-cards.js";
import { sortMilestoneReminderTargets } from "../src/services/milestone-reminders.js";

const DEFAULT_TODAY_PROJECT_KEYWORDS = ["敏捷自助分析平台", "敏捷自主分析平台", "数字化门迎"];

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
  return {
    send: argv.includes("--send"),
    today: argv.includes("--today"),
    chatId: argv.find((item) => item.startsWith("--chat-id="))?.slice("--chat-id=".length) || "",
    chatName: argv.find((item) => item.startsWith("--chat-name="))?.slice("--chat-name=".length) || "飞书机器人测试群",
    baseUrl: argv.find((item) => item.startsWith("--base-url="))?.slice("--base-url=".length) || process.env.PUBLIC_BASE_URL || "",
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

async function buildTodayMilestoneCard(chatId, args) {
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
  return buildMilestoneReminderCard(targets, {
    baseUrl: args.baseUrl,
    title: "重点项目里程碑提醒",
    subtitle: `${targets.length} 个节点需要关注`,
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

  const card = args.today
    ? await buildTodayMilestoneCard(chat.chatId, args)
    : buildSampleCard(chat.chatId, args.baseUrl);
  if (!args.send) {
    console.log(JSON.stringify(card, null, 2));
    return;
  }

  const tenantAccessToken = await fetchTenantAccessToken();
  await sendFeishuCardMessage({
    receiveId: chat.chatId,
    tenantAccessToken,
    card,
    uuid: `test-card-${Date.now()}`.slice(0, 50),
  });
  console.log("测试卡片已发送");
}

main()
  .catch((error) => {
    console.error(`测试卡片发送失败：${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
