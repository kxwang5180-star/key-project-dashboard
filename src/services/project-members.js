import { prisma } from "../lib/prisma.js";
import { fetchFeishuChatMemberNames } from "../lib/feishu.js";
import { buildFeishuChatMemberRecord, buildProjectMemberRecord, normalizeEmail, resolveMemberId } from "./project-member-records.js";

export async function getAllowedProjectIdsForUser(user) {
  if (!user) return [];
  if (user.role === "ADMIN") {
    const projects = await prisma.project.findMany({ select: { id: true } });
    return projects.map((project) => project.id);
  }

  const conditions = [];
  if (user.id) conditions.push({ userId: user.id });
  if (user.feishuUserId) conditions.push({ feishuUserId: user.feishuUserId });
  if (user.feishuOpenId) conditions.push({ feishuOpenId: user.feishuOpenId });
  if (user.feishuUnionId) conditions.push({ feishuUnionId: user.feishuUnionId });
  if (user.email) conditions.push({ email: normalizeEmail(user.email) });

  const memberships = conditions.length
    ? await prisma.projectMember.findMany({
        where: { OR: conditions },
        select: { projectId: true },
      })
    : [];

  const ids = new Set(memberships.map((item) => item.projectId));
  if (user.defaultProjectId) ids.add(user.defaultProjectId);
  return [...ids];
}

export async function canUserMaintainProject(user, projectId) {
  if (!user || !projectId) return false;
  if (user.role === "ADMIN") return true;
  const allowedProjectIds = await getAllowedProjectIdsForUser(user);
  return allowedProjectIds.includes(projectId);
}

export async function ensureUserProjectMembershipLinks(user) {
  if (!user) return;
  const conditions = [];
  if (user.feishuUserId) conditions.push({ feishuUserId: user.feishuUserId });
  if (user.feishuOpenId) conditions.push({ feishuOpenId: user.feishuOpenId });
  if (user.feishuUnionId) conditions.push({ feishuUnionId: user.feishuUnionId });
  if (user.email) conditions.push({ email: normalizeEmail(user.email) });
  if (!conditions.length) return;

  await prisma.projectMember.updateMany({
    where: {
      userId: null,
      OR: conditions,
    },
    data: { userId: user.id },
  });
}

async function fetchStoredOrLiveChatMembers(chatId) {
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
  if (storedMembers.length) return storedMembers;

  const errors = [];
  for (const memberIdType of ["user_id", "open_id"]) {
    try {
      const members = await fetchFeishuChatMemberNames(chatId, {
        ignoreUserDetailErrors: true,
        memberIdType,
      });
      if (members.length) return members;
    } catch (error) {
      errors.push(`${memberIdType}: ${error.message}`);
    }
  }

  if (errors.length) throw new Error(errors.join("；"));
  return [];
}

export async function syncProjectMembersFromFeishuChat(projectId, chatId) {
  const members = await fetchStoredOrLiveChatMembers(chatId);

  await prisma.project.update({
    where: { id: projectId },
    data: { feishuChatId: chatId },
  });

  const activeMemberIds = members.map((member) => resolveMemberId(member, projectId)).filter(Boolean);

  await prisma.$transaction(async (tx) => {
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

  return members;
}
