import { Router } from "express";
import { MilestoneStatus, ProjectStage } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRoles } from "../middleware/authenticate.js";
import { canUserMaintainProject, getAllowedProjectIdsForUser, syncProjectMembersFromFeishuChat } from "../services/project-members.js";

export const projectRouter = Router();

projectRouter.use(authenticate);

projectRouter.get("/", async (req, res) => {
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
      feishuChatId: true,
      established: true,
      stage: true,
      updatedAt: true,
    },
  });
  res.json(projects);
});

projectRouter.put("/:id/chat", requireRoles("ADMIN"), async (req, res) => {
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
});

projectRouter.post("/:id/chat/sync", requireRoles("ADMIN"), async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    select: { id: true, feishuChatId: true },
  });
  if (!project) return res.status(404).json({ message: "项目不存在" });

  const chatId = String(req.body?.chatId || project.feishuChatId || "").trim();
  if (!chatId) return res.status(400).json({ message: "请先配置项目群 chat_id" });

  const members = await syncProjectMembersFromFeishuChat(req.params.id, chatId);
  res.json({
    ok: true,
    chatId,
    members: members.map((member) => ({
      memberId: member.memberId,
      name: member.name,
      email: member.email,
    })),
  });
});

projectRouter.put("/:id/brief", async (req, res) => {
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
  res.json(project);
});

projectRouter.put("/:id/metrics", async (req, res) => {
  if (!(await canUserMaintainProject(req.user, req.params.id))) {
    return res.status(403).json({ message: "你不在该项目群聊成员中，不能维护该项目" });
  }
  const metrics = Array.isArray(req.body?.metrics) ? req.body.metrics : [];
  await prisma.$transaction(async (tx) => {
    await tx.metric.deleteMany({ where: { projectId: req.params.id } });
    if (!metrics.length) return;
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
  });
  res.json({ ok: true });
});

projectRouter.put("/:id/milestones", async (req, res) => {
  if (!(await canUserMaintainProject(req.user, req.params.id))) {
    return res.status(403).json({ message: "你不在该项目群聊成员中，不能维护该项目" });
  }
  const milestones = Array.isArray(req.body?.milestones) ? req.body.milestones : [];
  await prisma.$transaction(async (tx) => {
    await tx.milestone.deleteMany({ where: { projectId: req.params.id } });
    if (!milestones.length) return;
    await tx.milestone.createMany({
      data: milestones.map((milestone, index) => ({
        projectId: req.params.id,
        title: String(milestone.title || `里程碑 ${index + 1}`).trim(),
        source: String(milestone.source || "项目维护").trim(),
        rawText: String(milestone.rawText || milestone.raw || "").trim() || null,
        dueDate: milestone.dueDate ? new Date(milestone.dueDate) : milestone.dateKey ? new Date(milestone.dateKey) : null,
        status:
          milestone.status && Object.values(MilestoneStatus).includes(milestone.status)
            ? milestone.status
            : MilestoneStatus.PLANNED,
        sortOrder: index,
        changeSummary: String(milestone.changeSummary || milestone.changeNote || "").trim() || null,
      })),
    });
  });
  res.json({ ok: true });
});
