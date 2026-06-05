import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncRoute } from "../lib/async-route.js";
import { authenticate } from "../middleware/authenticate.js";
import { canUserMaintainProject, getAllowedProjectIdsForUser } from "../services/project-members.js";
import {
  buildMilestoneUpdateFromReport,
  buildRiskFromReport,
  hasMeaningfulReportProgress,
  normalizeMilestoneState,
  normalizeReportWeekNumber,
  parseReportMilestoneDate,
  toPublicProjectReportState,
  toPublicWeeklyReport,
} from "../services/report-records.js";

export const reportRouter = Router();

reportRouter.use(authenticate);

reportRouter.get("/", asyncRoute(async (req, res) => {
  const allowedProjectIds = await getAllowedProjectIdsForUser(req.user);
  const reports = await prisma.weeklyReport.findMany({
    where: req.user.role === "ADMIN" ? undefined : { projectId: { in: allowedProjectIds } },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
    include: {
      author: {
        select: {
          id: true,
          name: true,
          role: true,
        },
      },
    },
  });

  res.json({ reports: reports.map((report) => toPublicWeeklyReport(report)) });
}));

reportRouter.post("/", asyncRoute(async (req, res) => {
  const {
    projectId,
    milestoneId = null,
    weekNumber,
    progress,
    riskSummary = null,
    milestoneTitle = null,
    milestoneDate = null,
    milestoneState = null,
  } = req.body || {};

  const normalizedWeekNumber = normalizeReportWeekNumber(weekNumber);
  if (!projectId || !normalizedWeekNumber || !hasMeaningfulReportProgress(progress)) {
    return res.status(400).json({ message: "项目、周次、进展必填" });
  }

  if (!(await canUserMaintainProject(req.user, projectId))) {
    return res.status(403).json({ message: "你不在该项目群聊成员中，不能提交该项目填报" });
  }

  const result = await prisma.$transaction(async (tx) => {
    const existingMilestone = milestoneId
      ? await tx.milestone.findFirst({
          where: {
            id: milestoneId,
            projectId,
          },
          select: {
            id: true,
            title: true,
            dueDate: true,
            status: true,
            changeSummary: true,
          },
        })
      : null;

    const milestoneUpdate = buildMilestoneUpdateFromReport(existingMilestone, {
      milestoneTitle,
      milestoneDate,
      milestoneState,
    });
    if (existingMilestone && milestoneUpdate) {
      await tx.milestone.update({
        where: { id: existingMilestone.id },
        data: milestoneUpdate,
      });
    }

    const risk = buildRiskFromReport({
      projectId,
      riskSummary,
      ownerName: req.user.name,
    });
    if (risk) {
      await tx.risk.create({ data: risk });
    }

    const savedReport = await tx.weeklyReport.create({
      data: {
        projectId,
        milestoneId: existingMilestone?.id || null,
        authorId: req.user.id,
        weekNumber: normalizedWeekNumber,
        progress: String(progress).trim(),
        riskSummary: riskSummary ? String(riskSummary).trim() : null,
        milestoneTitle: milestoneTitle ? String(milestoneTitle).trim() : null,
        milestoneDate: parseReportMilestoneDate(milestoneDate),
        milestoneState: normalizeMilestoneState(milestoneState),
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    });

    const projectState = await tx.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        milestones: {
          orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }],
        },
        risks: {
          where: {
            status: {
              not: "CLOSED",
            },
          },
          orderBy: [{ level: "desc" }, { createdAt: "desc" }],
        },
      },
    });

    return {
      report: savedReport,
      projectState,
    };
  });

  res.status(201).json({
    report: toPublicWeeklyReport(result.report),
    projectState: result.projectState ? toPublicProjectReportState(result.projectState) : null,
  });
}));
