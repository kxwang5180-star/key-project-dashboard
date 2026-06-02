import { Router } from "express";
import { MilestoneStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/authenticate.js";
import { canUserMaintainProject } from "../services/project-members.js";

export const reportRouter = Router();

reportRouter.use(authenticate);

reportRouter.post("/", async (req, res) => {
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

  if (!projectId || !weekNumber || !progress) {
    return res.status(400).json({ message: "项目、周次、进展必填" });
  }

  if (!(await canUserMaintainProject(req.user, projectId))) {
    return res.status(403).json({ message: "你不在该项目群聊成员中，不能提交该项目填报" });
  }

  const report = await prisma.weeklyReport.create({
    data: {
      projectId,
      milestoneId,
      authorId: req.user.id,
      weekNumber: Number(weekNumber),
      progress: String(progress).trim(),
      riskSummary: riskSummary ? String(riskSummary).trim() : null,
      milestoneTitle: milestoneTitle ? String(milestoneTitle).trim() : null,
      milestoneDate: milestoneDate ? new Date(milestoneDate) : null,
      milestoneState:
        milestoneState && Object.values(MilestoneStatus).includes(milestoneState)
          ? milestoneState
          : null,
    },
  });

  res.status(201).json(report);
});
