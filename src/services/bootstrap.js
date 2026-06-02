import { prisma } from "../lib/prisma.js";

export async function getBootstrapPayload() {
  const [projects, governanceTasks] = await Promise.all([
    prisma.project.findMany({
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
    prisma.governanceTask.findMany({
      orderBy: [{ status: "asc" }, { level: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  return {
    projects,
    governanceTasks,
  };
}
