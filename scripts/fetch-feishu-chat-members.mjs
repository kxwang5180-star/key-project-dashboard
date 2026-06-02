import { config } from "../src/config.js";
import { fetchFeishuChatMemberNames } from "../src/lib/feishu.js";

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return "";
  return process.argv[index + 1] || "";
}

function maskId(value) {
  const text = String(value || "");
  if (text.length <= 8) return text;
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

const chatId = getArgValue("--chat-id") || config.feishu.defaultChatId;
const jsonOutput = process.argv.includes("--json");

if (!chatId) {
  console.error("Missing chat_id. Use FEISHU_CHAT_ID in .env or pass --chat-id <chat_id>.");
  process.exit(1);
}

try {
  const members = await fetchFeishuChatMemberNames(chatId, {
    ignoreUserDetailErrors: true,
    memberIdType: "user_id",
  });

  const simplified = members.map((member, index) => ({
    index: index + 1,
    memberId: member.memberId,
    name: member.name || "未获取到姓名",
    email: member.email || "",
    mobile: member.mobile || "",
  }));

  if (jsonOutput) {
    console.log(JSON.stringify(simplified, null, 2));
  } else {
    console.log(`chat_id: ${maskId(chatId)}`);
    console.log(`members: ${simplified.length}`);
    console.table(simplified);
  }
} catch (error) {
  console.error(`Failed to fetch Feishu chat members: ${error.message}`);
  process.exit(1);
}
