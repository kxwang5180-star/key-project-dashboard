import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { PrismaClient, GovernanceLevel, MilestoneStatus, ProjectStage } from "@prisma/client";
import bcrypt from "bcryptjs";
import { config } from "../src/config.js";
import { metricSeedKey, milestoneSeedKey, planSeedRecordReconciliation } from "../src/services/seed-sync-records.js";

const prisma = new PrismaClient();

function cleanProjectName(name) {
  return String(name || "")
    .replace(/[【】]/g, "")
    .replace(/项目$/, "")
    .trim();
}

function canonicalProjectKey(name) {
  const aliases = {
    合同系统: "合同管理系统",
    大排档赋值台计数: "大排档赋值计数",
  };
  const cleanName = cleanProjectName(name);
  return aliases[cleanName] || cleanName;
}

function compactText(text, maxLength = 86) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function parseMetricNumber(value) {
  const match = String(value || "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function splitLines(text) {
  return String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== "暂无");
}

function formatDateKey(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function makeDateInfo(year, month, day) {
  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return {
    key: formatDateKey(year, month, day),
    date,
  };
}

function parseDateFromText(text) {
  const compact = String(text || "").replace(/\s+/g, "");
  const full = compact.match(/(20\d{2})[年/.-](\d{1,2})[月/.-](\d{1,2})日?/);
  if (full) {
    const [, year, month, day] = full.map(Number);
    return makeDateInfo(year, month, day);
  }

  const monthDay = compact.match(/(\d{1,2})[月/.](\d{1,2})日?/);
  if (monthDay) {
    const [, month, day] = monthDay.map(Number);
    return makeDateInfo(new Date().getFullYear(), month, day);
  }

  const shortMay = compact.match(/^5(\d{2})(?=完成|上线|发布|前|$)/);
  if (shortMay) {
    return makeDateInfo(new Date().getFullYear(), 5, Number(shortMay[1]));
  }

  return null;
}

function cleanMilestoneTitle(line) {
  return String(line || "")
    .replace(/^里程碑\s*\d+\s*[：:]/, "")
    .replace(/^(20\d{2})[年/.-]\d{1,2}[月/.-]\d{1,2}日?[，,:：\s-]*/, "")
    .replace(/^\d{1,2}[月/.]\d{1,2}日?[，,:：\s-]*/, "")
    .replace(/^5\d{2}(完成|上线|发布)?[：:，,\s-]*/, "")
    .trim();
}

function inferMilestoneStatus(line, dateInfo) {
  const text = String(line || "");
  if (/调整|变更|延期|推迟/.test(text)) return MilestoneStatus.CHANGED;
  if (/已完成|已上线|已发布|已确认|评审完成|交付完成|封版上线/.test(text)) return MilestoneStatus.COMPLETED;
  if (/开发|测试|试点|持续|进行|联调|排期中/.test(text)) return MilestoneStatus.IN_PROGRESS;
  if (!dateInfo) return MilestoneStatus.PLANNED;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = (dateInfo.date - today) / 86400000;
  if (diffDays < 0) return MilestoneStatus.OVERDUE;
  if (diffDays <= 7) return MilestoneStatus.UPCOMING;
  return MilestoneStatus.PLANNED;
}

function extractMetricHighlights(text) {
  const source = String(text || "");
  const highlights = [];
  const percentRegex = /([^，。；;\n]{0,18}?)(\d+(?:\.\d+)?)%/g;
  let match = percentRegex.exec(source);
  while (match && highlights.length < 4) {
    highlights.push({
      name: match[1].replace(/[，。；;\n]/g, "").trim() || "指标",
      currentValue: `${match[2]}%`,
      targetValue: "100%",
      observation: compactText(source, 90),
    });
    match = percentRegex.exec(source);
  }
  return highlights;
}

async function readSourceRows() {
  const filePath = path.resolve(process.cwd(), "data.js");
  const raw = await fs.readFile(filePath, "utf8");
  const sandbox = {
    window: {},
  };
  vm.runInNewContext(raw, sandbox, { filename: "data.js" });
  return {
    projects: Array.isArray(sandbox.window.PROJECT_SOURCE) ? sandbox.window.PROJECT_SOURCE : [],
    milestones: Array.isArray(sandbox.window.PROJECT_MILESTONE_SOURCE) ? sandbox.window.PROJECT_MILESTONE_SOURCE : [],
    metrics: Array.isArray(sandbox.window.PROJECT_METRIC_SOURCE) ? sandbox.window.PROJECT_METRIC_SOURCE : [],
  };
}

function parseExplicitMilestoneDate(value) {
  const text = String(value || "").trim();
  if (!text || text === "待定") return null;
  const match = text.match(/^(20\d{2})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!match) return null;
  return makeDateInfo(Number(match[1]), Number(match[2]), Number(match[3]));
}

function buildMilestoneSeedData({ item, index, projectId, hasExplicitMilestones }) {
  const dateInfo = item.date ? parseExplicitMilestoneDate(item.date) : parseDateFromText(item.line);
  const title = hasExplicitMilestones ? item.line : cleanMilestoneTitle(item.line) || item.line;
  return {
    projectId,
    title,
    source: item.source,
    rawText: item.line,
    dueDate: dateInfo?.date || null,
    status: inferMilestoneStatus(item.line, dateInfo),
    sortOrder: index,
  };
}

function buildMetricSeedData({ metric, index, projectId }) {
  return {
    projectId,
    name: metric.name || `指标 ${index + 1}`,
    currentValue: metric.currentValue || null,
    targetValue: metric.targetValue || null,
    observation: metric.observation || null,
    chartType: parseMetricNumber(metric.targetValue) !== null ? "donut" : "value",
    sortOrder: index,
  };
}

async function reconcileMilestones(tx, projectId, desiredMilestones) {
  const existingMilestones = await tx.milestone.findMany({
    where: { projectId },
    include: { _count: { select: { reports: true } } },
  });
  const plan = planSeedRecordReconciliation({
    existingRecords: existingMilestones,
    desiredRecords: desiredMilestones,
    getExistingKey: milestoneSeedKey,
    getDesiredKey: milestoneSeedKey,
    relationName: "reports",
  });

  for (const { existing, desired } of plan.updates) {
    await tx.milestone.update({
      where: { id: existing.id },
      data: desired,
    });
  }

  if (plan.creates.length) {
    await tx.milestone.createMany({ data: plan.creates });
  }

  if (plan.deleteIds.length) {
    await tx.milestone.deleteMany({ where: { id: { in: plan.deleteIds } } });
  }

  for (const [index, milestone] of plan.archive.entries()) {
    await tx.milestone.update({
      where: { id: milestone.id },
      data: {
        source: "历史里程碑",
        status: MilestoneStatus.CHANGED,
        sortOrder: desiredMilestones.length + index,
        changeSummary: milestone.changeSummary || "标准清单同步后保留历史填报关联",
      },
    });
  }
}

async function reconcileMetrics(tx, projectId, desiredMetrics) {
  const existingMetrics = await tx.metric.findMany({
    where: { projectId },
    include: { _count: { select: { records: true } } },
  });
  const plan = planSeedRecordReconciliation({
    existingRecords: existingMetrics,
    desiredRecords: desiredMetrics,
    getExistingKey: metricSeedKey,
    getDesiredKey: metricSeedKey,
    relationName: "records",
  });

  for (const { existing, desired } of plan.updates) {
    await tx.metric.update({
      where: { id: existing.id },
      data: desired,
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
        observation: metric.observation || "标准清单同步后保留历史指标记录",
      },
    });
  }
}

async function seedProjects(rows, structuredMilestones = [], structuredMetrics = []) {
  await prisma.governanceTask.deleteMany();
  const milestoneRowsByProject = structuredMilestones.reduce((map, milestone) => {
    const key = canonicalProjectKey(milestone.projectName);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(milestone);
    return map;
  }, new Map());
  const metricRowsByProject = structuredMetrics.reduce((map, metric) => {
    const key = canonicalProjectKey(metric.projectName);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(metric);
    return map;
  }, new Map());

  for (const row of rows) {
    const shortName = cleanProjectName(row.name);
    const explicitMetrics = metricRowsByProject.get(canonicalProjectKey(row.name)) || [];
    const metrics = explicitMetrics.length
      ? explicitMetrics.map((metric) => ({
          name: metric.name,
          currentValue: metric.current,
          targetValue: metric.target,
          observation: metric.observation,
        }))
      : extractMetricHighlights(row.metricsText);
    const explicitMilestones = milestoneRowsByProject.get(canonicalProjectKey(row.name)) || [];
    const milestones = explicitMilestones.length
      ? explicitMilestones.map((milestone) => ({
          line: milestone.title,
          source: "标准里程碑",
          date: milestone.date,
        }))
      : [
          ...splitLines(row.mayKeyNodes).map((line) => ({ line, source: "5月关键节点" })),
          ...splitLines(row.futureMilestones).map((line) => ({ line, source: "未来里程碑" })),
        ];

    await prisma.$transaction(async (tx) => {
      await tx.project.upsert({
        where: { id: row.id },
        update: {
          name: row.name,
          shortName,
          ownerName: row.owner || null,
          businessLine: row.businessLine || "未填业务线",
          description: row.overallText || "",
          metricsSummary: row.metricsText || "",
          keyNodesSummary: row.mayKeyNodes || "",
          futurePlan: row.futureMilestones || "",
          teamSummary: row.teamText || "",
          established: row.established === "是",
          isKeyProject: row.isKeyProject === "是",
          stage: row.established === "是" ? ProjectStage.IN_PROGRESS : ProjectStage.PLANNED,
        },
        create: {
          id: row.id,
          name: row.name,
          shortName,
          ownerName: row.owner || null,
          businessLine: row.businessLine || "未填业务线",
          description: row.overallText || "",
          metricsSummary: row.metricsText || "",
          keyNodesSummary: row.mayKeyNodes || "",
          futurePlan: row.futureMilestones || "",
          teamSummary: row.teamText || "",
          established: row.established === "是",
          isKeyProject: row.isKeyProject === "是",
          stage: row.established === "是" ? ProjectStage.IN_PROGRESS : ProjectStage.PLANNED,
        },
      });

      await reconcileMilestones(
        tx,
        row.id,
        milestones.map((item, index) =>
          buildMilestoneSeedData({ item, index, projectId: row.id, hasExplicitMilestones: Boolean(explicitMilestones.length) })
        )
      );

      const metricSeedData = (metrics.length ? metrics : [{ name: "项目指标", currentValue: "", targetValue: "", observation: compactText(row.metricsText, 90) }]).map(
        (metric, index) => buildMetricSeedData({ metric, index, projectId: row.id })
      );
      await reconcileMetrics(tx, row.id, metricSeedData);

      if (row.established !== "是") {
        await tx.governanceTask.create({
          data: {
            projectId: row.id,
            taskType: "立项治理",
            title: "重点项目尚未正式立项",
            detail: "需要确认项目治理口径、资源归属与后续追踪方式。",
            level: GovernanceLevel.HIGH,
          },
        });
      }
    });
  }
}

async function ensureAdmin() {
  const passwordHash = await bcrypt.hash(config.admin.password, 10);
  await prisma.user.upsert({
    where: { email: config.admin.email.toLowerCase() },
    update: {
      name: config.admin.name,
      passwordHash,
      role: "ADMIN",
    },
    create: {
      name: config.admin.name,
      email: config.admin.email.toLowerCase(),
      passwordHash,
      role: "ADMIN",
    },
  });
}

async function main() {
  const { projects, milestones, metrics } = await readSourceRows();
  await ensureAdmin();
  await seedProjects(projects, milestones, metrics);
  console.log(`Seed completed: ${projects.length} projects imported.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
