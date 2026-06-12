import { prisma } from "../src/lib/prisma.js";
import {
  buildMilestoneReminderCard,
  buildProjectScopedMilestoneReminderCards,
} from "../src/services/milestone-reminder-cards.js";
import {
  buildMilestoneReminderTargets,
  getMilestoneReminderDateRange,
  sortMilestoneReminderTargets,
} from "../src/services/milestone-reminders.js";

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
    sample: argv.includes("--sample"),
    printCard: argv.includes("--print-card"),
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
      title: "重点项目里程碑提醒",
      subtitle: "1 个节点需要关注",
      template: "orange",
    }
  );
}

async function buildReminderWindowMilestoneCards(chatId, args) {
  const now = new Date(`${args.dateKey}T00:00:00.000Z`);
  const { minDate, maxDate } = getMilestoneReminderDateRange(now);
  if (!minDate || !maxDate) return [];
  const projects = await prisma.project.findMany({
    where: {
      OR: args.projectKeywords.flatMap((keyword) => [
        { name: { contains: keyword } },
        { shortName: { contains: keyword } },
      ]),
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
  const targets = buildMilestoneReminderTargets(projects.map((project) => ({
    ...project,
    feishuChatId: chatId,
  })), now);
  if (!targets.length) {
    throw new Error(`${args.dateKey} 未找到匹配项目在今日/明日提醒窗口内的未完成里程碑：${args.projectKeywords.join("、")}`);
  }
  return buildProjectScopedMilestoneReminderCards(sortMilestoneReminderTargets(targets), {
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

  const cards = args.sample
    ? [buildSampleCard(chat.chatId, args.baseUrl)]
    : await buildReminderWindowMilestoneCards(chat.chatId, args);
  if (!args.send) {
    console.log(JSON.stringify(cards, null, 2));
    return;
  }

  const { fetchTenantAccessToken, sendFeishuCardMessage } = await import("../src/lib/feishu.js");
  const tenantAccessToken = await fetchTenantAccessToken();
  for (const [index, card] of cards.entries()) {
    if (args.printCard) {
      console.log(`[card ${index + 1}/${cards.length}] ${JSON.stringify(card, null, 2)}`);
    }
    const result = await sendFeishuCardMessage({
      receiveId: chat.chatId,
      tenantAccessToken,
      card,
      uuid: `test-card-${index}-${Date.now()}`.slice(0, 50),
    });
    const messageId = result.message_id || result.open_message_id || result.message?.message_id || "";
    console.log(`测试卡片已发送 ${index + 1}/${cards.length}${messageId ? `，message_id：${messageId}` : ""}`);
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
