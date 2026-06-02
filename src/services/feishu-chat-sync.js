import { prisma } from "../lib/prisma.js";
import {
  fetchFeishuChatMembers,
  fetchFeishuContactUser,
  fetchFeishuUserChats,
  fetchTenantAccessToken,
  refreshFeishuUserAccessToken,
} from "../lib/feishu.js";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function getTokenExpiresAt(tokenData) {
  const expiresIn = Number(tokenData.expires_in || tokenData.expiresIn || 0);
  if (!expiresIn) return null;
  return new Date(Date.now() + Math.max(expiresIn - 60, 60) * 1000);
}

export function buildFeishuTokenData(tokenData) {
  return {
    feishuAccessToken: tokenData.access_token || null,
    feishuRefreshToken: tokenData.refresh_token || null,
    feishuTokenExpiresAt: getTokenExpiresAt(tokenData),
  };
}

export async function getValidUserAccessToken(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      feishuAccessToken: true,
      feishuRefreshToken: true,
      feishuTokenExpiresAt: true,
    },
  });
  if (!user?.feishuAccessToken) throw new Error("当前账号没有可用的飞书用户授权，请重新飞书登录");

  const expiresAt = user.feishuTokenExpiresAt?.getTime() || 0;
  if (expiresAt > Date.now() + 60_000) return user.feishuAccessToken;
  if (!user.feishuRefreshToken) throw new Error("飞书用户授权已过期，请重新飞书登录");

  const tokenData = await refreshFeishuUserAccessToken(user.feishuRefreshToken);
  await prisma.user.update({
    where: { id: user.id },
    data: buildFeishuTokenData(tokenData),
  });
  return tokenData.access_token;
}

async function resolveChatMember(member, tenantAccessToken) {
  const memberId = member.member_id || member.user_id || member.open_id || "";
  let contactUser = null;
  if (memberId) {
    try {
      contactUser = await fetchFeishuContactUser(memberId, tenantAccessToken, {
        userIdType: "user_id",
      });
    } catch {
      contactUser = null;
    }
  }

  const email = normalizeEmail(contactUser?.email || member.email || "");
  const matchedUser = await prisma.user.findFirst({
    where: {
      OR: [
        memberId ? { feishuUserId: memberId } : undefined,
        contactUser?.open_id ? { feishuOpenId: contactUser.open_id } : undefined,
        contactUser?.union_id ? { feishuUnionId: contactUser.union_id } : undefined,
        email ? { email } : undefined,
      ].filter(Boolean),
    },
    select: { id: true },
  });

  return {
    memberId,
    userId: matchedUser?.id || null,
    feishuUserId: memberId || null,
    feishuOpenId: contactUser?.open_id || null,
    feishuUnionId: contactUser?.union_id || null,
    name: contactUser?.name || member.name || member.member_name || "未命名成员",
    email: email || null,
    avatarUrl: contactUser?.avatar?.avatar_72 || contactUser?.avatar_url || member.avatar_url || null,
    raw: {
      member,
      user: contactUser,
    },
  };
}

export async function syncMyFeishuChatsAndMembers(userId) {
  const userAccessToken = await getValidUserAccessToken(userId);
  const [tenantAccessToken, chats] = await Promise.all([fetchTenantAccessToken(), fetchFeishuUserChats(userAccessToken)]);
  let memberTotal = 0;
  const errors = [];

  for (const chat of chats) {
    const chatId = chat.chat_id || chat.chatId;
    if (!chatId) continue;

    let members = [];
    try {
      members = await fetchFeishuChatMembers(chatId, tenantAccessToken, {
        memberIdType: "user_id",
      });
    } catch (error) {
      errors.push({
        chatId,
        name: chat.name || chatId,
        message: error.message,
      });
    }
    const resolvedMembers = [];
    for (const member of members) {
      resolvedMembers.push(await resolveChatMember(member, tenantAccessToken));
    }
    memberTotal += resolvedMembers.length;

    await prisma.$transaction(async (tx) => {
      await tx.feishuChat.upsert({
        where: { chatId },
        update: {
          name: chat.name || chatId,
          description: chat.description || null,
          ownerUserId: userId,
          memberCount: resolvedMembers.length || Number(chat.member_count || chat.memberCount || 0),
          lastSyncedAt: new Date(),
        },
        create: {
          chatId,
          name: chat.name || chatId,
          description: chat.description || null,
          ownerUserId: userId,
          memberCount: resolvedMembers.length || Number(chat.member_count || chat.memberCount || 0),
          lastSyncedAt: new Date(),
        },
      });

      const activeMemberIds = resolvedMembers.map((member) => member.memberId).filter(Boolean);
      if (activeMemberIds.length) {
        await tx.feishuChatMember.deleteMany({
          where: {
            chatId,
            memberId: { notIn: activeMemberIds },
          },
        });
      }

      for (const member of resolvedMembers) {
        const memberId = member.memberId || `${chatId}-${member.email || member.name}`;
        await tx.feishuChatMember.upsert({
          where: {
            chatId_memberId: {
              chatId,
              memberId,
            },
          },
          update: {
            userId: member.userId,
            feishuUserId: member.feishuUserId,
            feishuOpenId: member.feishuOpenId,
            feishuUnionId: member.feishuUnionId,
            name: member.name,
            email: member.email,
            avatarUrl: member.avatarUrl,
            raw: member.raw,
          },
          create: {
            chatId,
            memberId,
            userId: member.userId,
            feishuUserId: member.feishuUserId,
            feishuOpenId: member.feishuOpenId,
            feishuUnionId: member.feishuUnionId,
            name: member.name,
            email: member.email,
            avatarUrl: member.avatarUrl,
            raw: member.raw,
          },
        });
      }
    });
  }

  return {
    chatCount: chats.length,
    memberCount: memberTotal,
    errorCount: errors.length,
    errors,
  };
}
