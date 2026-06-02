import { prisma } from "../lib/prisma.js";
import { fetchFeishuChatMemberNames } from "../lib/feishu.js";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

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

export async function syncProjectMembersFromFeishuChat(projectId, chatId) {
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
  const members = storedMembers.length
    ? storedMembers
    : await fetchFeishuChatMemberNames(chatId, {
        ignoreUserDetailErrors: true,
        memberIdType: "user_id",
      });

  await prisma.project.update({
    where: { id: projectId },
    data: { feishuChatId: chatId },
  });

  const activeMemberIds = members.map((member) => member.memberId).filter(Boolean);

  await prisma.$transaction(async (tx) => {
    if (activeMemberIds.length) {
      await tx.projectMember.deleteMany({
        where: {
          projectId,
          memberId: { notIn: activeMemberIds },
        },
      });
    }

    for (const member of members) {
      const email = normalizeEmail(member.email);
      const resolvedMemberId = member.memberId || email || `${projectId}-${member.name}`;
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

      await tx.projectMember.upsert({
        where: {
          projectId_memberId: {
            projectId,
            memberId: resolvedMemberId,
          },
        },
        update: {
          userId: matchedUser?.id || null,
          feishuUserId: member.feishuUserId || member.memberId || null,
          feishuOpenId: member.feishuOpenId || null,
          feishuUnionId: member.feishuUnionId || null,
          memberId: resolvedMemberId,
          name: member.name || "未命名成员",
          email: email || null,
        },
        create: {
          projectId,
          userId: matchedUser?.id || null,
          feishuUserId: member.feishuUserId || member.memberId || null,
          feishuOpenId: member.feishuOpenId || null,
          feishuUnionId: member.feishuUnionId || null,
          memberId: resolvedMemberId,
          name: member.name || "未命名成员",
          email: email || null,
        },
      });
    }
  });

  return members;
}
