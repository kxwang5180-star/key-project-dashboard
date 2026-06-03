import { normalizeEmail } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import {
  fetchFeishuChatMembers,
  fetchFeishuContactUser,
  fetchFeishuUserChats,
  fetchTenantAccessToken,
  refreshFeishuUserAccessToken,
} from "../lib/feishu.js";
import {
  buildChatMemberCountUpdate,
  buildChatMemberFetchAttempts,
  buildEmptyMemberSyncWarning,
} from "./feishu-chat-sync-diagnostics.js";

export { buildChatMemberCountUpdate, buildChatMemberFetchAttempts, buildEmptyMemberSyncWarning };

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
  const memberIdType = member.open_id || /^ou_/.test(memberId) ? "open_id" : "user_id";
  let contactUser = null;
  if (memberId) {
    try {
      contactUser = await fetchFeishuContactUser(memberId, tenantAccessToken, {
        userIdType: memberIdType,
      });
    } catch {
      contactUser = null;
    }
  }

  const email = normalizeEmail(contactUser?.email || member.email || "");
  const matchedUser = await prisma.user.findFirst({
    where: {
      OR: [
        memberIdType === "user_id" && memberId ? { feishuUserId: memberId } : undefined,
        memberIdType === "open_id" && memberId ? { feishuOpenId: memberId } : undefined,
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
    feishuUserId: memberIdType === "user_id" ? memberId || null : null,
    feishuOpenId: contactUser?.open_id || (memberIdType === "open_id" ? memberId || null : null),
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

async function fetchChatMembersWithFallback(chatId, userAccessToken, tenantAccessToken) {
  const attempts = buildChatMemberFetchAttempts({ userAccessToken, tenantAccessToken });
  const errors = [];
  let emptyResult = null;

  for (const attempt of attempts) {
    try {
      const members = await fetchFeishuChatMembers(chatId, attempt.token, {
        memberIdType: attempt.memberIdType,
      });
      if (members.length) return { members, memberIdType: attempt.memberIdType, source: attempt.label };
      emptyResult = { members, memberIdType: attempt.memberIdType, source: attempt.label };
    } catch (error) {
      errors.push(`${attempt.label}: ${error.message}`);
    }
  }

  if (errors.length) throw new Error(errors.join("；"));
  return emptyResult || { members: [], memberIdType: "user_id", source: "empty" };
}

export async function fetchAndResolveFeishuChatMembers(chatId, userId) {
  const userAccessToken = userId ? await getValidUserAccessToken(userId) : null;
  const tenantAccessToken = await fetchTenantAccessToken();
  const result = await fetchChatMembersWithFallback(chatId, userAccessToken, tenantAccessToken);
  const resolvedMembers = [];
  for (const member of result.members) {
    resolvedMembers.push(await resolveChatMember(member, tenantAccessToken));
  }
  return {
    ...result,
    members: resolvedMembers,
  };
}

export async function syncMyFeishuChatsAndMembers(userId, options = {}) {
  const userAccessToken = await getValidUserAccessToken(userId);
  const includeMembers = options.includeMembers === true;
  const chats = await fetchFeishuUserChats(userAccessToken);
  const tenantAccessToken = includeMembers ? await fetchTenantAccessToken() : null;
  let memberTotal = 0;
  const errors = [];

  for (const chat of chats) {
    const chatId = chat.chat_id || chat.chatId;
    if (!chatId) continue;

    let members = [];
    let memberSource = includeMembers ? "" : "chat-list-only";
    if (includeMembers) {
      try {
        const result = await fetchChatMembersWithFallback(chatId, userAccessToken, tenantAccessToken);
        members = result.members;
        memberSource = result.source;
        if (!members.length) {
          errors.push(
            buildEmptyMemberSyncWarning({
              chatId,
              chatName: chat.name || chatId,
              source: result.source,
              memberIdType: result.memberIdType,
            })
          );
        }
      } catch (error) {
        errors.push({
          chatId,
          name: chat.name || chatId,
          message: error.message,
        });
      }
    }
    const resolvedMembers = [];
    for (const member of members) {
      resolvedMembers.push(await resolveChatMember(member, tenantAccessToken));
    }
    memberTotal += resolvedMembers.length;
    const existingChat = await prisma.feishuChat.findUnique({
      where: { chatId },
      select: { memberCount: true },
    });
    const memberCountUpdate = buildChatMemberCountUpdate({
      existingMemberCount: existingChat?.memberCount || 0,
      resolvedMemberCount: resolvedMembers.length,
      chatMemberCount: chat.member_count || chat.memberCount || 0,
      includeMembers,
    });

    await prisma.$transaction(async (tx) => {
      await tx.feishuChat.upsert({
        where: { chatId },
        update: {
          name: chat.name || chatId,
          description: chat.description || null,
          discoveredBy: { connect: { id: userId } },
          memberCount: memberCountUpdate.memberCount,
          lastSyncedAt: new Date(),
          raw: { chat, memberSource },
        },
        create: {
          chatId,
          name: chat.name || chatId,
          description: chat.description || null,
          discoveredBy: { connect: { id: userId } },
          memberCount: memberCountUpdate.memberCount,
          lastSyncedAt: new Date(),
          raw: { chat, memberSource },
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
    membersSynced: includeMembers,
    errorCount: errors.length,
    errors,
  };
}
