import { prisma } from "../src/lib/prisma.js";
import { fetchTenantAccessToken, sendFeishuCardMessage } from "../src/lib/feishu.js";
import { buildMilestoneReminderCard } from "../src/services/milestone-reminder-cards.js";

function parseArgs(argv) {
  return {
    send: argv.includes("--send"),
    chatId: argv.find((item) => item.startsWith("--chat-id="))?.slice("--chat-id=".length) || "",
    chatName: argv.find((item) => item.startsWith("--chat-name="))?.slice("--chat-name=".length) || "飞书机器人测试群",
    baseUrl: argv.find((item) => item.startsWith("--base-url="))?.slice("--base-url=".length) || process.env.PUBLIC_BASE_URL || "",
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

  const card = buildSampleCard(chat.chatId, args.baseUrl);
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
