import { Router } from "express";
import { MilestoneStatus, ProjectStage } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/authenticate.js";

export const projectRouter = Router();

projectRouter.use(authenticate);

projectRouter.get("/", async (_req, res) => {
  const projects = await prisma.project.findMany({
    orderBy: [{ businessLine: "asc" }, { shortName: "asc" }],
    select: {
      id: true,
      name: true,
      shortName: true,
      businessLine: true,
      ownerName: true,
      established: true,
      stage: true,
      updatedAt: true,
    },
  });
  res.json(projects);
});

projectRouter.put("/:id/brief", async (req, res) => {
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
