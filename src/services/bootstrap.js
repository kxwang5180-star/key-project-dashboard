import { prisma } from "../lib/prisma.js";
import { getAllowedProjectIdsForUser } from "./project-members.js";
import { toPublicWeeklyReport } from "./report-records.js";

export async function getBootstrapPayload(user) {
  const allowedProjectIds = await getAllowedProjectIdsForUser(user);
  const projectWhere = user?.role === "ADMIN" ? undefined : { id: { in: allowedProjectIds } };
  const [projects, governanceTasks] = await Promise.all([
    prisma.project.findMany({
      where: projectWhere,
      orderBy: [{ businessLine: "asc" }, { shortName: "asc" }],
      include: {
        milestones: {
          orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }],
        },
        metrics: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: {
            records: {
              orderBy: { recordDate: "asc" },
            },
          },
        },
        risks: {
          where: {
            status: {
              not: "CLOSED",
            },
          },
          orderBy: [{ level: "desc" }, { createdAt: "desc" }],
        },
        members: {
          orderBy: [{ name: "asc" }],
          select: {
            id: true,
            userId: true,
            memberId: true,
            name: true,
            email: true,
          },
        },
        reports: {
          orderBy: [{ weekNumber: "desc" }, { createdAt: "desc" }],
          take: 20,
          include: {
            author: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
          },
        },
      },
    }),
    user?.role === "ADMIN"
      ? prisma.governanceTask.findMany({
          orderBy: [{ status: "asc" }, { level: "desc" }, { createdAt: "desc" }],
        })
      : [],
  ]);

  return {
    projects: projects.map((project) => ({
      ...project,
      reports: project.reports.map((report) => toPublicWeeklyReport(report)),
    })),
    governanceTasks,
  };
}
