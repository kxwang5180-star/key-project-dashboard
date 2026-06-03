import { Router } from "express";
import { ProjectStage } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { asyncRoute } from "../lib/async-route.js";
import { config } from "../config.js";
import { authenticate, requireRoles } from "../middleware/authenticate.js";
import { canManageIdentity } from "../lib/auth.js";
import { canUserMaintainProject, getAllowedProjectIdsForUser, syncProjectMembersFromFeishuChat } from "../services/project-members.js";
import { normalizeProjectMilestoneStatus, toPublicProjectBrief, toPublicProjectMaintenanceState } from "../services/project-records.js";

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
  if (!chatId) return res.status(400).json({ message: "chat_id 必填" });
  const chat = await prisma.feishuChat.findUnique({ where: { chatId } });
  if (!chat) return res.status(400).json({ message: "该群聊尚未同步，请先同步我的飞书群聊后再选择" });

  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: { feishuChatId: chatId },
    select: {
      id: true,
      shortName: true,
      feishuChatId: true,
    },
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

  const chatId = String(req.body?.chatId || project.feishuChatId || "").trim();
  if (!chatId) return res.status(400).json({ message: "请先配置项目群 chat_id" });

  const members = await syncProjectMembersFromFeishuChat(req.params.id, chatId, {
    userId: req.user.id,
  });
  res.json({
    ok: true,
    chatId,
    members: members.map((member) => ({
      memberId: member.memberId,
      name: member.name,
      email: member.email,
    })),
  });
}));

projectRouter.put("/:id/brief", asyncRoute(async (req, res) => {
  if (!(await canUserMaintainProject(req.user, req.params.id))) {
    return res.status(403).json({ message: "你不在该项目群聊成员中，不能维护该项目" });
  }
  const { ownerName, description, stage, changeSummary } = req.body || {};
  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: {
      ownerName: ownerName ?? undefined,
      description: description ?? undefined,
      stage: stage && Object.values(ProjectStage).includes(stage) ? stage : undefined,
      changeSummary: changeSummary ?? undefined,
    },
  });
  res.json({ brief: toPublicProjectBrief(project) });
}));

projectRouter.put("/:id/metrics", asyncRoute(async (req, res) => {
  if (!(await canUserMaintainProject(req.user, req.params.id))) {
    return res.status(403).json({ message: "你不在该项目群聊成员中，不能维护该项目" });
  }
  const metrics = Array.isArray(req.body?.metrics) ? req.body.metrics : [];
  const projectState = await prisma.$transaction(async (tx) => {
    await tx.metric.deleteMany({ where: { projectId: req.params.id } });
    if (metrics.length) {
      await tx.metric.createMany({
        data: metrics.map((metric, index) => ({
          projectId: req.params.id,
          name: String(metric.name || `指标 ${index + 1}`).trim(),
          currentValue: String(metric.currentValue || metric.current || "").trim() || null,
          targetValue: String(metric.targetValue || metric.target || "").trim() || null,
          observation: String(metric.observation || "").trim() || null,
          chartType: String(metric.chartType || "").trim() || null,
          sortOrder: index,
        })),
      });
    }
    return tx.project.findUnique({
      where: { id: req.params.id },
      include: {
        metrics: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        milestones: { orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }] },
      },
    });
  });
  res.json({ projectState: toPublicProjectMaintenanceState(projectState) });
}));

projectRouter.put("/:id/milestones", asyncRoute(async (req, res) => {
  if (!(await canUserMaintainProject(req.user, req.params.id))) {
    return res.status(403).json({ message: "你不在该项目群聊成员中，不能维护该项目" });
  }
  const milestones = Array.isArray(req.body?.milestones) ? req.body.milestones : [];
  const projectState = await prisma.$transaction(async (tx) => {
    await tx.milestone.deleteMany({ where: { projectId: req.params.id } });
    if (milestones.length) {
      await tx.milestone.createMany({
        data: milestones.map((milestone, index) => ({
          projectId: req.params.id,
          title: String(milestone.title || `里程碑 ${index + 1}`).trim(),
          source: String(milestone.source || "项目维护").trim(),
          rawText: String(milestone.rawText || milestone.raw || "").trim() || null,
          dueDate: milestone.dueDate ? new Date(milestone.dueDate) : milestone.dateKey ? new Date(milestone.dateKey) : null,
          status: normalizeProjectMilestoneStatus(milestone.status),
          sortOrder: index,
          changeSummary: String(milestone.changeSummary || milestone.changeNote || "").trim() || null,
        })),
      });
    }
    return tx.project.findUnique({
      where: { id: req.params.id },
      include: {
        metrics: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        milestones: { orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }] },
      },
    });
  });
  res.json({ projectState: toPublicProjectMaintenanceState(projectState) });
}));
