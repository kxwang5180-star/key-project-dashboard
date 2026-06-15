import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  buildDesiredMetricsForProject,
  buildMetricSourceReconciliationPlan,
  groupMetricSourceRowsByProject,
  splitDesiredMetricForUpdate,
} from "../src/services/metric-source-sync.js";

function hasFlag(name) {
  return process.argv.includes(name);
}

async function readSourceRows() {
  const filePath = path.resolve(process.cwd(), "data.js");
  const raw = await fs.readFile(filePath, "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(raw, sandbox, { filename: "data.js" });
  return {
    projects: Array.isArray(sandbox.window.PROJECT_SOURCE) ? sandbox.window.PROJECT_SOURCE : [],
    metrics: Array.isArray(sandbox.window.PROJECT_METRIC_SOURCE) ? sandbox.window.PROJECT_METRIC_SOURCE : [],
  };
}

async function syncProjectMetrics({ tx, project, desiredMetrics, dryRun }) {
  const existingMetrics = await tx.metric.findMany({
    where: { projectId: project.id },
    include: { _count: { select: { records: true } } },
  });
  const plan = buildMetricSourceReconciliationPlan({ existingMetrics, desiredMetrics });

  if (dryRun) {
    return {
      projectId: project.id,
      projectName: project.name,
      desired: desiredMetrics.length,
      update: plan.updates.length,
      create: plan.creates.length,
      remove: plan.deleteIds.length,
      archive: plan.archive.length,
    };
  }

  for (const { existing, desired } of plan.updates) {
    const update = splitDesiredMetricForUpdate(desired);
    await tx.metric.update({
      where: { id: existing.id },
      data: update.data,
    });
  }

  for (const desired of plan.creates) {
    await tx.metric.create({ data: desired });
  }

  if (plan.deleteIds.length) {
    await tx.metric.deleteMany({ where: { id: { in: plan.deleteIds } } });
  }

  for (const [index, metric] of plan.archive.entries()) {
    await tx.metric.update({
      where: { id: metric.id },
      data: {
        sortOrder: desiredMetrics.length + index,
        observation: metric.observation || "标准指标清单更新后保留历史记录",
      },
    });
  }

  return {
    projectId: project.id,
    projectName: project.name,
    desired: desiredMetrics.length,
    update: plan.updates.length,
    create: plan.creates.length,
    remove: plan.deleteIds.length,
    archive: plan.archive.length,
  };
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  if (!process.env.DATABASE_URL) {
    console.error("缺少 DATABASE_URL，无法连接数据库。请在服务器项目目录或已加载 .env 的环境中执行。");
    process.exitCode = 1;
    return;
  }
  const { projects, metrics } = await readSourceRows();
  const metricRowsByProject = groupMetricSourceRowsByProject(metrics);
  const projectIds = projects.map((project) => project.id);
  const prisma = new PrismaClient();

  const results = await prisma.$transaction(async (tx) => {
    const existingProjects = await tx.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });
    const projectNameById = new Map(existingProjects.map((project) => [project.id, project.name]));

    return Promise.all(
      projects.map((project) =>
        syncProjectMetrics({
          tx,
          project: {
            id: project.id,
            name: projectNameById.get(project.id) || project.name,
          },
          desiredMetrics: buildDesiredMetricsForProject({ project, metricRowsByProject }),
          dryRun,
        })
      )
    );
  });

  await prisma.$disconnect();

  const totals = results.reduce(
    (summary, item) => ({
      desired: summary.desired + item.desired,
      update: summary.update + item.update,
      create: summary.create + item.create,
      remove: summary.remove + item.remove,
      archive: summary.archive + item.archive,
    }),
    { desired: 0, update: 0, create: 0, remove: 0, archive: 0 }
  );
  const action = dryRun ? "Metrics sync dry-run" : "Metrics sync completed";
  console.log(
    `${action}: ${projects.length} projects, ${totals.desired} desired metrics, ${totals.update} updates, ${totals.create} creates, ${totals.remove} removes, ${totals.archive} archived.`
  );
  for (const item of results.filter((result) => result.create || result.remove || result.archive)) {
    console.log(
      `- ${item.projectName}: desired ${item.desired}, create ${item.create}, remove ${item.remove}, archive ${item.archive}`
    );
  }
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
