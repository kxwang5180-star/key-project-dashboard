import { GovernanceLevel, GovernanceStatus } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncRoute } from "../lib/async-route.js";
import { authenticate, requireRoles } from "../middleware/authenticate.js";
import { getAllowedProjectIdsForUser } from "../services/project-members.js";

export const governanceRouter = Router();

governanceRouter.use(authenticate);

governanceRouter.get("/", asyncRoute(async (req, res) => {
  const allowedProjectIds = await getAllowedProjectIdsForUser(req.user);
  const tasks = await prisma.governanceTask.findMany({
    where: req.user.role === "ADMIN" ? undefined : { projectId: { in: allowedProjectIds } },
    orderBy: [{ status: "asc" }, { level: "desc" }, { createdAt: "desc" }],
  });
  res.json(tasks);
}));

governanceRouter.post("/", requireRoles("ADMIN"), asyncRoute(async (req, res) => {
  const { projectId, taskType, title, detail, level = GovernanceLevel.MEDIUM, ownerName = null } = req.body || {};
  if (!projectId || !taskType || !title || !detail) {
    return res.status(400).json({ message: "项目、类型、标题、详情必填" });
  }
  const task = await prisma.governanceTask.create({
    data: {
      projectId,
      taskType: String(taskType).trim(),
      title: String(title).trim(),
      detail: String(detail).trim(),
      level,
      ownerName: ownerName ? String(ownerName).trim() : null,
    },
  });
  res.status(201).json(task);
}));

governanceRouter.put("/:id", requireRoles("ADMIN"), asyncRoute(async (req, res) => {
  const { status, ownerName } = req.body || {};
  const task = await prisma.governanceTask.update({
    where: { id: req.params.id },
    data: {
      status: status && Object.values(GovernanceStatus).includes(status) ? status : undefined,
      ownerName: ownerName !== undefined ? String(ownerName || "").trim() || null : undefined,
    },
  });
  res.json(task);
}));
