import { Router } from "express";
import { ProjectStage } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { asyncRoute } from "../lib/async-route.js";
import { config } from "../config.js";
import { authenticate, requireRoles } from "../middleware/authenticate.js";
import { canManageIdentity } from "../lib/auth.js";
import { canUserMaintainProject, getAllowedProjectIdsForUser, syncProjectMembersFromFeishuChat } from "../services/project-members.js";
import { resolveProjectChatSelection } from "../services/project-chat-records.js";
import { resolveProjectMaintenanceAccess } from "../services/project-maintenance-records.js";
import {
  buildProjectMetricCreateData,
  buildProjectMilestoneCreateData,
  splitMetricCreateDataForUpdate,
  toPublicProjectBrief,
  toPublicProjectMaintenanceState,
} from "../services/project-records.js";
import { writeAuditLog } from "../services/audit-log.js";
import { buildProjectChatAuditDetail } from "../services/audit-log-records.js";
import { metricSeedKey, milestoneSeedKey, planSeedRecordReconciliation, withoutId } from "../services/seed-sync-records.js";

export const projectRouter = Router();

projectRouter.use(authenticate);

projectRouter.get("/", asyncRoute(async (req, res) => {
  const allowedProjectIds = await getAllowedProjectIdsForUser(req.user);
  const projects = await prisma.project.findMany({
    where: req.user.role === "ADMIN" ? undefined : { id: { in: allowedProjectIds } },
    orderBy: [{ businessLine: "asc" }, { shortName: "asc" }],
    select: {
      id: true,
      name: true,
      shortName: true,
      businessLine: true,
      ownerName: true,
      description: true,
      feishuChatId: true,
      established: true,
      stage: true,
      updatedAt: true,
    },
  });
  res.json(projects);
}));

projectRouter.put("/:id/chat", requireRoles("ADMIN"), asyncRoute(async (req, res) => {
  if (!canManageIdentity(req.user)) {
    return res.status(403).json({ message: "只有身份管理员可以绑定项目群聊" });
  }
  const chatId = String(req.body?.chatId || "").trim();
  if (!chatId) return res.status(400).json({ message: "请先配置项目群 chat_id" });
  const projectRecord = await prisma.project.findUnique({
    where: { id: req.params.id },
    select: { id: true, feishuChatId: true },
  });
  const chat = await prisma.feishuChat.findUnique({ where: { chatId } });
  const selection = resolveProjectChatSelection({ project: projectRecord, requestedChatId: chatId, chat });
  if (!selection.ok) return res.status(selection.status).json({ message: selection.message });

  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: { feishuChatId: selection.chatId },
    select: {
      id: true,
      shortName: true,
      feishuChatId: true,
    },
  });
  await writeAuditLog({
    userId: req.user.id,
    action: "project.chat.bind",
    targetType: "Project",
    targetId: req.params.id,
    detail: buildProjectChatAuditDetail({ chatId: selection.chatId }),
  });
  res.json({ project });
}));

projectRouter.post("/:id/chat/sync", requireRoles("ADMIN"), asyncRoute(async (req, res) => {
  if (!canManageIdentity(req.user)) {
    return res.status(403).json({ message: "只有身份管理员可以同步项目群成员" });
  }
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    select: { id: true, feishuChatId: true },
  });
  if (!project) return res.status(404).json({ message: "项目不存在" });

  const requestedChatId = String(req.body?.chatId || project.feishuChatId || "").trim();
  const chat = requestedChatId ? await prisma.feishuChat.findUnique({ where: { chatId: requestedChatId } }) : null;
  const selection = resolveProjectChatSelection({ project, requestedChatId, chat });
  if (!selection.ok) return res.status(selection.status).json({ message: selection.message });

  const syncResult = await syncProjectMembersFromFeishuChat(req.params.id, selection.chatId, {
    userId: req.user.id,
  });
  const members = syncResult.members || [];
  await writeAuditLog({
    userId: req.user.id,
    action: "project.chat.members.sync",
    targetType: "Project",
    targetId: req.params.id,
    detail: buildProjectChatAuditDetail({ chatId: selection.chatId, memberCount: members.length, memberSource: syncResult.source }),
  });
  res.json({
    ok: true,
    chatId: selection.chatId,
    memberSource: syncResult.source,
    refreshed: syncResult.refreshed,
    members: members.map((member) => ({
      memberId: member.memberId,
      name: member.name,
      email: member.email,
    })),
  });
}));

projectRouter.put("/:id/brief", asyncRoute(async (req, res) => {
  const existingProject = await prisma.project.findUnique({ where: { id: req.params.id }, select: { id: true } });
  const access = resolveProjectMaintenanceAccess({
    project: existingProject,
    canMaintain: existingProject ? await canUserMaintainProject(req.user, req.params.id) : false,
  });
  if (!access.ok) return res.status(access.status).json({ message: access.message });

  const { ownerName, businessLine, description, teamSummary, stage, changeSummary } = req.body || {};
  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: {
      ownerName: ownerName ?? undefined,
      businessLine: businessLine ?? undefined,
      description: description ?? undefined,
      teamSummary: teamSummary ?? undefined,
      stage: stage && Object.values(ProjectStage).includes(stage) ? stage : undefined,
      changeSummary: changeSummary ?? undefined,
    },
  });
  await writeAuditLog({
    userId: req.user.id,
    action: "project.brief.update",
    targetType: "Project",
    targetId: req.params.id,
    detail: {
      ownerName: ownerName ?? null,
      businessLine: businessLine ?? null,
      hasDescription: description !== undefined,
      hasTeamSummary: teamSummary !== undefined,
      stage: stage || null,
    },
  });
  res.json({ brief: toPublicProjectBrief(project) });
}));

projectRouter.put("/:id/metrics", asyncRoute(async (req, res) => {
  const existingProject = await prisma.project.findUnique({ where: { id: req.params.id }, select: { id: true } });
  const access = resolveProjectMaintenanceAccess({
    project: existingProject,
    canMaintain: existingProject ? await canUserMaintainProject(req.user, req.params.id) : false,
  });
  if (!access.ok) return res.status(access.status).json({ message: access.message });

  const metrics = Array.isArray(req.body?.metrics) ? req.body.metrics : [];
  const projectState = await prisma.$transaction(async (tx) => {
    const desiredMetrics = metrics.map((metric, index) => buildProjectMetricCreateData(metric, { projectId: req.params.id, index }));
    const existingMetrics = await tx.metric.findMany({
      where: { projectId: req.params.id },
      include: { _count: { select: { records: true } } },
    });
    const metricPlan = planSeedRecordReconciliation({
      existingRecords: existingMetrics,
      desiredRecords: desiredMetrics,
      getExistingKey: metricSeedKey,
      getDesiredKey: metricSeedKey,
      relationName: "records",
      preferDesiredId: true,
    });
    for (const { existing, desired } of metricPlan.updates) {
      const update = splitMetricCreateDataForUpdate(desired);
      await tx.metric.update({
        where: { id: existing.id },
        data: update.data,
      });
      if (update.records.length) {
        await tx.metricRecord.deleteMany({ where: { metricId: existing.id } });
        await tx.metricRecord.createMany({
          data: update.records.map((record) => ({ ...record, metricId: existing.id })),
        });
      }
    }
    for (const desired of metricPlan.creates) {
      await tx.metric.create({ data: desired });
    }
    if (metricPlan.deleteIds.length) {
      await tx.metric.deleteMany({ where: { id: { in: metricPlan.deleteIds } } });
    }
    for (const [index, metric] of metricPlan.archive.entries()) {
      await tx.metric.update({
        where: { id: metric.id },
        data: {
          sortOrder: desiredMetrics.length + index,
          observation: metric.observation || "指标已从当前维护清单移除，因存在历史记录予以保留",
        },
      });
    }
    await writeAuditLog({
      client: tx,
      userId: req.user.id,
      action: "project.metrics.update",
      targetType: "Project",
      targetId: req.params.id,
      detail: {
        metricCount: metrics.length,
        historyRecordCount: metrics.reduce((sum, metric) => sum + (Array.isArray(metric.history) ? metric.history.length : 0), 0),
      },
    });
    return tx.project.findUnique({
      where: { id: req.params.id },
      include: {
        metrics: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: { records: { orderBy: { recordDate: "asc" } } },
        },
        milestones: { orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }] },
      },
    });
  });
  res.json({ projectState: toPublicProjectMaintenanceState(projectState) });
}));

projectRouter.put("/:id/milestones", asyncRoute(async (req, res) => {
  const existingProject = await prisma.project.findUnique({ where: { id: req.params.id }, select: { id: true } });
  const access = resolveProjectMaintenanceAccess({
    project: existingProject,
    canMaintain: existingProject ? await canUserMaintainProject(req.user, req.params.id) : false,
  });
  if (!access.ok) return res.status(access.status).json({ message: access.message });

  const milestones = Array.isArray(req.body?.milestones) ? req.body.milestones : [];
  const projectState = await prisma.$transaction(async (tx) => {
    const desiredMilestones = milestones.map((milestone, index) => buildProjectMilestoneCreateData(milestone, { projectId: req.params.id, index }));
    const existingMilestones = await tx.milestone.findMany({
      where: { projectId: req.params.id },
      include: { _count: { select: { reports: true } } },
    });
    const milestonePlan = planSeedRecordReconciliation({
      existingRecords: existingMilestones,
      desiredRecords: desiredMilestones,
      getExistingKey: milestoneSeedKey,
      getDesiredKey: milestoneSeedKey,
      relationName: "reports",
      preferDesiredId: true,
    });
    for (const { existing, desired } of milestonePlan.updates) {
      await tx.milestone.update({
        where: { id: existing.id },
        data: withoutId(desired),
      });
    }
    if (milestonePlan.creates.length) {
      await tx.milestone.createMany({ data: milestonePlan.creates });
    }
    if (milestonePlan.deleteIds.length) {
      await tx.milestone.deleteMany({ where: { id: { in: milestonePlan.deleteIds } } });
    }
    for (const [index, milestone] of milestonePlan.archive.entries()) {
      await tx.milestone.update({
        where: { id: milestone.id },
        data: {
          source: "历史里程碑",
          status: "CHANGED",
          sortOrder: desiredMilestones.length + index,
          changeSummary: milestone.changeSummary || "里程碑已从当前维护清单移除，因存在周报关联予以保留",
        },
      });
    }
    await writeAuditLog({
      client: tx,
      userId: req.user.id,
      action: "project.milestones.update",
      targetType: "Project",
      targetId: req.params.id,
      detail: {
        milestoneCount: milestones.length,
      },
    });
    return tx.project.findUnique({
      where: { id: req.params.id },
      include: {
        metrics: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: { records: { orderBy: { recordDate: "asc" } } },
        },
        milestones: { orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }] },
      },
    });
  });
  res.json({ projectState: toPublicProjectMaintenanceState(projectState) });
}));
