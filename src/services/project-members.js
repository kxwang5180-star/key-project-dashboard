import { prisma } from "../lib/prisma.js";
import { buildAllowedProjectIds } from "../lib/project-access.js";
import { fetchAndResolveFeishuChatMembers } from "./feishu-chat-sync.js";
import {
  buildFeishuChatMemberRecord,
  buildProjectMemberRecord,
  buildUserMembershipLinkWhere,
  buildUserProjectMemberConditions,
  chooseChatMemberSyncMembers,
  normalizeEmail,
  resolveMemberId,
} from "./project-member-records.js";

export async function getAllowedProjectIdsForUser(user) {
  if (!user) return [];
  const allProjects = user.role === "ADMIN" ? await prisma.project.findMany({ select: { id: true } }) : [];
  if (user.role === "ADMIN") {
    return buildAllowedProjectIds({
      role: user.role,
      allProjectIds: allProjects.map((project) => project.id),
    });
  }

  const conditions = buildUserProjectMemberConditions(user);

  const memberships = conditions.length
    ? await prisma.projectMember.findMany({
        where: { OR: conditions },
        select: { projectId: true },
      })
    : [];

  return buildAllowedProjectIds({
    role: user.role,
    membershipProjectIds: memberships.map((item) => item.projectId),
  });
}

export async function canUserMaintainProject(user, projectId) {
  if (!user || !projectId) return false;
  if (user.role === "ADMIN") return true;
  const allowedProjectIds = await getAllowedProjectIdsForUser(user);
  return allowedProjectIds.includes(projectId);
}

export async function ensureUserProjectMembershipLinks(user) {
  if (!user) return;
  const where = buildUserMembershipLinkWhere(user);
  if (!where) return;

  await prisma.projectMember.updateMany({
    where,
    data: { userId: user.id },
  });
  await prisma.feishuChatMember.updateMany({
    where,
    data: { userId: user.id },
  });
}

async function fetchStoredOrLiveChatMembers(chatId, options = {}) {
  const storedMembers = await prisma.feishuChatMember.findMany({
    where: { chatId },
    select: {
      memberId: true,
      name: true,
      email: true,
      feishuUserId: true,
      feishuOpenId: true,
      feishuUnionId: true,
      userId: true,
    },
  });

  if (!options.userId) return chooseChatMemberSyncMembers({ storedMembers });

  let liveMembers = [];
  try {
    const result = await fetchAndResolveFeishuChatMembers(chatId, options.userId);
    liveMembers = result.members;
  } catch (error) {
    if (!storedMembers.length) throw error;
  }

  return chooseChatMemberSyncMembers({
    storedMembers,
    liveMembers,
    preferLive: true,
  });
}

export async function syncProjectMembersFromFeishuChat(projectId, chatId, options = {}) {
  const syncResult = await fetchStoredOrLiveChatMembers(chatId, options);
  const members = syncResult.members;

  const activeMemberIds = members.map((member) => resolveMemberId(member, projectId)).filter(Boolean);

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: projectId },
      data: { feishuChatId: chatId },
    });

    if (activeMemberIds.length) {
      await tx.projectMember.deleteMany({
        where: {
          projectId,
          memberId: { notIn: activeMemberIds },
        },
      });
      await tx.feishuChatMember.deleteMany({
        where: {
          chatId,
          memberId: { notIn: activeMemberIds },
        },
      });
    }

    for (const member of members) {
      const email = normalizeEmail(member.email);
      const matchedUser = member.userId
        ? { id: member.userId }
        : await tx.user.findFirst({
            where: {
              OR: [
                member.memberId ? { feishuUserId: member.memberId } : undefined,
                member.feishuUserId ? { feishuUserId: member.feishuUserId } : undefined,
                member.feishuOpenId ? { feishuOpenId: member.feishuOpenId } : undefined,
                member.feishuUnionId ? { feishuUnionId: member.feishuUnionId } : undefined,
                email ? { email } : undefined,
              ].filter(Boolean),
            },
            select: { id: true },
          });
      const projectMemberRecord = buildProjectMemberRecord(member, {
        projectId,
        matchedUserId: matchedUser?.id || null,
      });
      const chatMemberRecord = buildFeishuChatMemberRecord(member, {
        chatId,
        matchedUserId: matchedUser?.id || null,
      });

      await tx.projectMember.upsert({
        where: {
          projectId_memberId: {
            projectId,
            memberId: projectMemberRecord.memberId,
          },
        },
        update: {
          userId: projectMemberRecord.userId,
          feishuUserId: projectMemberRecord.feishuUserId,
          feishuOpenId: projectMemberRecord.feishuOpenId,
          feishuUnionId: projectMemberRecord.feishuUnionId,
          memberId: projectMemberRecord.memberId,
          name: projectMemberRecord.name,
          email: projectMemberRecord.email,
        },
        create: projectMemberRecord,
      });

      await tx.feishuChatMember.upsert({
        where: {
          chatId_memberId: {
            chatId,
            memberId: chatMemberRecord.memberId,
          },
        },
        update: {
          userId: chatMemberRecord.userId,
          feishuUserId: chatMemberRecord.feishuUserId,
          feishuOpenId: chatMemberRecord.feishuOpenId,
          feishuUnionId: chatMemberRecord.feishuUnionId,
          name: chatMemberRecord.name,
          email: chatMemberRecord.email,
          avatarUrl: chatMemberRecord.avatarUrl,
          raw: chatMemberRecord.raw,
        },
        create: chatMemberRecord,
      });
    }

    await tx.feishuChat.updateMany({
      where: { chatId },
      data: {
        memberCount: members.length,
        lastSyncedAt: new Date(),
      },
    });
  });

  return {
    members,
    source: syncResult.source,
    refreshed: syncResult.shouldWrite,
  };
}
