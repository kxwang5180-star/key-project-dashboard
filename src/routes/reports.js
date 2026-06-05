import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncRoute } from "../lib/async-route.js";
import { authenticate, requireRoles } from "../middleware/authenticate.js";
import { canUserMaintainProject, getAllowedProjectIdsForUser } from "../services/project-members.js";
import { resolveProjectMaintenanceAccess } from "../services/project-maintenance-records.js";
import { writeAuditLog } from "../services/audit-log.js";
import {
  buildMilestoneUpdateFromReport,
  buildRiskFromReport,
  buildWeeklyReportLookup,
  buildWeeklyReportDeleteAuditDetail,
  hasMeaningfulReportProgress,
  normalizeMilestoneState,
  normalizeReportWeekNumber,
  parseReportMilestoneDate,
  shouldCreateRiskForReportChange,
  toPublicProjectReportState,
  toPublicWeeklyReport,
} from "../services/report-records.js";

export const reportRouter = Router();

reportRouter.use(authenticate);

reportRouter.get("/", asyncRoute(async (req, res) => {
  const allowedProjectIds = await getAllowedProjectIdsForUser(req.user);
  const reports = await prisma.weeklyReport.findMany({
    where: req.user.role === "ADMIN" ? undefined : { projectId: { in: allowedProjectIds } },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
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

async function deleteWeeklyReportById(req, res) {
  const report = await prisma.weeklyReport.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      projectId: true,
      weekNumber: true,
      authorId: true,
      progress: true,
      riskSummary: true,
    },
  });
  if (!report) return res.status(404).json({ message: "填报记录不存在或已删除" });

  await prisma.$transaction(async (tx) => {
    await tx.weeklyReport.delete({ where: { id: report.id } });
    await writeAuditLog({
      client: tx,
      userId: req.user.id,
      action: "weekly.report.delete",
      targetType: "WeeklyReport",
      targetId: report.id,
      detail: buildWeeklyReportDeleteAuditDetail(report),
    });
  });

  res.json({ ok: true, deletedId: report.id });
}

reportRouter.delete("/:id", requireRoles("ADMIN"), asyncRoute(deleteWeeklyReportById));
reportRouter.post("/:id/delete", requireRoles("ADMIN"), asyncRoute(deleteWeeklyReportById));

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

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  const access = resolveProjectMaintenanceAccess({
    project,
    canMaintain: project ? await canUserMaintainProject(req.user, projectId) : false,
    deniedMessage: "你不在该项目群聊成员中，不能提交该项目填报",
  });
  if (!access.ok) return res.status(access.status).json({ message: access.message });

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

    const reportLookup = buildWeeklyReportLookup({
      projectId,
      authorId: req.user.id,
      weekNumber: normalizedWeekNumber,
      milestoneId: existingMilestone?.id || null,
    });
    const existingReport = await tx.weeklyReport.findFirst({
      where: reportLookup,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        riskSummary: true,
      },
    });

    if (shouldCreateRiskForReportChange(existingReport, risk)) {
      await tx.risk.create({ data: risk });
    }

    const reportData = {
      progress: String(progress).trim(),
      riskSummary: riskSummary ? String(riskSummary).trim() : null,
      milestoneTitle: milestoneTitle ? String(milestoneTitle).trim() : null,
      milestoneDate: parseReportMilestoneDate(milestoneDate),
      milestoneState: normalizeMilestoneState(milestoneState),
    };
    const reportInclude = {
      author: {
        select: {
          id: true,
          name: true,
          role: true,
        },
      },
    };
    const savedReport = existingReport
      ? await tx.weeklyReport.update({
        where: { id: existingReport.id },
        data: reportData,
        include: reportInclude,
      })
      : await tx.weeklyReport.create({
        data: {
          ...reportLookup,
          ...reportData,
        },
        include: reportInclude,
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
