import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncRoute } from "../lib/async-route.js";
import { authenticate, requireRoles } from "../middleware/authenticate.js";
import { getAllowedProjectIdsForUser } from "../services/project-members.js";
import {
  buildGovernanceTaskIdentity,
  buildGovernanceTaskPersistencePlan,
  normalizeGovernanceLevel,
  normalizeGovernanceStatus,
} from "../services/governance-records.js";
import { writeAuditLog } from "../services/audit-log.js";
import { buildGovernanceAuditDetail } from "../services/audit-log-records.js";

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
  const { projectId, taskType, title, detail, level = "MEDIUM", status = "TODO", ownerName = null } = req.body || {};
  const identity = buildGovernanceTaskIdentity({ projectId, taskType, title, detail });
  if (!identity.projectId || !identity.taskType || !identity.title || !identity.detail) {
    return res.status(400).json({ message: "项目、类型、标题、详情必填" });
  }
  const project = await prisma.project.findUnique({
    where: { id: identity.projectId },
    select: { id: true },
  });
  if (!project) return res.status(404).json({ message: "项目不存在，不能创建治理任务" });
  const existingTask = await prisma.governanceTask.findFirst({
    where: identity,
    select: { id: true },
  });
  const persistence = buildGovernanceTaskPersistencePlan({ existingTask });
  const task = persistence.mode === "update"
    ? await prisma.governanceTask.update({
        where: { id: existingTask.id },
        data: {
          level: normalizeGovernanceLevel(level),
          status: normalizeGovernanceStatus(status),
          ownerName: ownerName ? String(ownerName).trim() : null,
        },
      })
    : await prisma.governanceTask.create({
        data: {
          ...identity,
          projectId: project.id,
          level: normalizeGovernanceLevel(level),
          status: normalizeGovernanceStatus(status),
          ownerName: ownerName ? String(ownerName).trim() : null,
        },
      });
  await writeAuditLog({
    userId: req.user.id,
    action: persistence.auditAction,
    targetType: "GovernanceTask",
    targetId: task.id,
    detail: buildGovernanceAuditDetail({ status: task.status, ownerName: task.ownerName }),
  });
  res.status(persistence.statusCode).json(task);
}));

governanceRouter.put("/:id", requireRoles("ADMIN"), asyncRoute(async (req, res) => {
  const { status, ownerName } = req.body || {};
  const existingTask = await prisma.governanceTask.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!existingTask) return res.status(404).json({ message: "治理任务不存在" });
  const task = await prisma.governanceTask.update({
    where: { id: req.params.id },
    data: {
      status: status ? normalizeGovernanceStatus(status) : undefined,
      ownerName: ownerName !== undefined ? String(ownerName || "").trim() || null : undefined,
    },
  });
  await writeAuditLog({
    userId: req.user.id,
    action: "governance.task.update",
    targetType: "GovernanceTask",
    targetId: task.id,
    detail: buildGovernanceAuditDetail({ status: status ?? null, ownerName: ownerName ?? null }),
  });
  res.json(task);
}));
