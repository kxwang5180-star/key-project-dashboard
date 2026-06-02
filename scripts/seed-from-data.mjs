import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { PrismaClient, GovernanceLevel, MilestoneStatus, ProjectStage } from "@prisma/client";
import bcrypt from "bcryptjs";
import { config } from "../src/config.js";

const prisma = new PrismaClient();

function cleanProjectName(name) {
  return String(name || "")
    .replace(/[【】]/g, "")
    .replace(/项目$/, "")
    .trim();
}

function compactText(text, maxLength = 86) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
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
  return Array.isArray(sandbox.window.PROJECT_SOURCE) ? sandbox.window.PROJECT_SOURCE : [];
}

async function seedProjects(rows) {
  await prisma.governanceTask.deleteMany();

  for (const row of rows) {
    const shortName = cleanProjectName(row.name);
    const metrics = extractMetricHighlights(row.metricsText);
    const milestones = [
      ...splitLines(row.mayKeyNodes).map((line) => ({ line, source: "5月关键节点" })),
      ...splitLines(row.futureMilestones).map((line) => ({ line, source: "未来里程碑" })),
    ];

    await prisma.project.upsert({
      where: { id: row.id },
      update: {
        name: row.name,
        shortName,
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

    await prisma.milestone.deleteMany({ where: { projectId: row.id } });
    await prisma.metric.deleteMany({ where: { projectId: row.id } });

    if (milestones.length) {
      await prisma.milestone.createMany({
        data: milestones.map((item, index) => {
          const dateInfo = parseDateFromText(item.line);
          const title = cleanMilestoneTitle(item.line) || item.line;
          return {
            projectId: row.id,
            title,
            source: item.source,
            rawText: item.line,
            dueDate: dateInfo?.date || null,
            status: inferMilestoneStatus(item.line, dateInfo),
            sortOrder: index,
          };
        }),
      });
    }

    await prisma.metric.createMany({
      data: (metrics.length ? metrics : [{ name: "项目指标", currentValue: "", targetValue: "", observation: compactText(row.metricsText, 90) }]).map(
        (metric, index) => ({
          projectId: row.id,
          name: metric.name || `指标 ${index + 1}`,
          currentValue: metric.currentValue || null,
          targetValue: metric.targetValue || null,
          observation: metric.observation || null,
          chartType: metric.targetValue ? "donut" : "value",
          sortOrder: index,
        })
      ),
    });

    if (row.established !== "是") {
      await prisma.governanceTask.create({
        data: {
          projectId: row.id,
          taskType: "立项治理",
          title: "重点项目尚未正式立项",
          detail: "需要确认项目治理口径、资源归属与后续追踪方式。",
          level: GovernanceLevel.HIGH,
        },
      });
    }
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
  const rows = await readSourceRows();
  await ensureAdmin();
  await seedProjects(rows);
  console.log(`Seed completed: ${rows.length} projects imported.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
