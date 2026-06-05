import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMilestoneUpdateFromReport,
  toPublicProjectReportState,
  buildRiskFromReport,
  buildWeeklyReportLookup,
  buildWeeklyReportDeleteAuditDetail,
  hasMeaningfulReportProgress,
  normalizeMilestoneState,
  parseReportMilestoneDate,
  normalizeReportWeekNumber,
  shouldCreateRiskForReportChange,
  toPublicWeeklyReport,
} from "../src/services/report-records.js";

test("toPublicWeeklyReport maps database weekly report to frontend submission shape", () => {
  const report = toPublicWeeklyReport({
    id: "report_1",
    projectId: "project_1",
    milestoneId: "milestone_1",
    weekNumber: 6,
    progress: "完成联调",
    riskSummary: "暂无",
    milestoneTitle: "试点上线",
    milestoneDate: new Date("2026-06-01T00:00:00.000Z"),
    milestoneState: "PLANNED",
    createdAt: new Date("2026-06-03T02:00:00.000Z"),
    updatedAt: new Date("2026-06-04T03:00:00.000Z"),
    author: {
      name: "王康旭",
      role: "MEMBER",
    },
  });

  assert.deepEqual(report, {
    id: "report_1",
    projectId: "project_1",
    milestoneId: "milestone_1",
    week: 6,
    memberName: "王康旭",
    memberRole: "项目成员",
    progress: "完成联调",
    risk: "暂无",
    milestoneTitle: "试点上线",
    milestoneDate: "2026-06-01",
    milestoneStatus: "planned",
    createdAt: "2026-06-03T02:00:00.000Z",
    updatedAt: "2026-06-04T03:00:00.000Z",
  });
});

test("buildWeeklyReportDeleteAuditDetail keeps deletion audit compact", () => {
  const detail = buildWeeklyReportDeleteAuditDetail({
    projectId: "project_1",
    weekNumber: 6,
    authorId: "user_1",
    riskSummary: "需要协调接口权限",
    progress: "本周完成联调，进入试运行。".repeat(8),
  });

  assert.equal(detail.projectId, "project_1");
  assert.equal(detail.weekNumber, 6);
  assert.equal(detail.authorId, "user_1");
  assert.equal(detail.hasRisk, true);
  assert.equal(detail.progressPreview.length, 80);
});

test("normalizeMilestoneState accepts frontend status keys", () => {
  assert.equal(normalizeMilestoneState("planned"), "PLANNED");
  assert.equal(normalizeMilestoneState("in-progress"), "IN_PROGRESS");
  assert.equal(normalizeMilestoneState("changed"), "CHANGED");
  assert.equal(normalizeMilestoneState("unknown"), null);
});

test("parseReportMilestoneDate returns null for invalid date keys", () => {
  assert.equal(parseReportMilestoneDate("bad-date"), null);
  assert.equal(parseReportMilestoneDate("2026-02-31"), null);
  assert.equal(parseReportMilestoneDate(""), null);
  assert.equal(parseReportMilestoneDate("2026-06-08").toISOString(), "2026-06-08T00:00:00.000Z");
});

test("normalizeReportWeekNumber accepts only whole weeks in an operating range", () => {
  assert.equal(normalizeReportWeekNumber("6"), 6);
  assert.equal(normalizeReportWeekNumber(12), 12);
  assert.equal(normalizeReportWeekNumber("0"), null);
  assert.equal(normalizeReportWeekNumber("3.5"), null);
  assert.equal(normalizeReportWeekNumber("bad"), null);
  assert.equal(normalizeReportWeekNumber(99), null);
});

test("hasMeaningfulReportProgress rejects template-only progress text", () => {
  assert.equal(hasMeaningfulReportProgress("第6周更新\n已完成：\n进行中：\n下周计划：\n需要协调："), false);
  assert.equal(hasMeaningfulReportProgress("   "), false);
  assert.equal(hasMeaningfulReportProgress("本周完成联调并进入试运行。"), true);
  assert.equal(hasMeaningfulReportProgress("已完成：完成合同系统联调\n进行中：整理验收材料"), true);
});

test("buildRiskFromReport creates a risk only for meaningful risk text", () => {
  assert.equal(buildRiskFromReport({ projectId: "p1", riskSummary: "暂无", ownerName: "王康旭" }), null);
  assert.equal(buildRiskFromReport({ projectId: "p1", riskSummary: "  ", ownerName: "王康旭" }), null);

  assert.deepEqual(buildRiskFromReport({ projectId: "p1", riskSummary: "接口联调存在阻塞", ownerName: "王康旭" }), {
    projectId: "p1",
    title: "本周填报风险",
    detail: "接口联调存在阻塞",
    level: "MEDIUM",
    ownerName: "王康旭",
    status: "OPEN",
    source: "成员填报",
  });
});

test("buildWeeklyReportLookup scopes duplicate submissions to one author project week milestone", () => {
  assert.deepEqual(buildWeeklyReportLookup({
    projectId: " p1 ",
    authorId: " u1 ",
    weekNumber: 3,
    milestoneId: " m1 ",
  }), {
    projectId: "p1",
    authorId: "u1",
    weekNumber: 3,
    milestoneId: "m1",
  });
  assert.deepEqual(buildWeeklyReportLookup({
    projectId: "p1",
    authorId: "u1",
    weekNumber: 3,
    milestoneId: "",
  }), {
    projectId: "p1",
    authorId: "u1",
    weekNumber: 3,
    milestoneId: null,
  });
});

test("shouldCreateRiskForReportChange avoids duplicate risk records for repeated submissions", () => {
  assert.equal(shouldCreateRiskForReportChange(null, { detail: "接口联调阻塞" }), true);
  assert.equal(shouldCreateRiskForReportChange({ riskSummary: "接口联调阻塞" }, { detail: "接口联调阻塞" }), false);
  assert.equal(shouldCreateRiskForReportChange({ riskSummary: "接口联调阻塞" }, { detail: "供应商资源不足" }), true);
  assert.equal(shouldCreateRiskForReportChange({ riskSummary: "" }, null), false);
});

test("buildMilestoneUpdateFromReport records milestone changes from weekly report", () => {
  const update = buildMilestoneUpdateFromReport(
    {
      title: "试点上线",
      dueDate: new Date("2026-06-01T00:00:00.000Z"),
      status: "PLANNED",
      changeSummary: "",
    },
    {
      milestoneTitle: "试点扩大上线",
      milestoneDate: "2026-06-08",
      milestoneState: "changed",
    }
  );

  assert.equal(update.title, "试点扩大上线");
  assert.equal(update.rawText, "试点扩大上线");
  assert.equal(update.dueDate.toISOString(), "2026-06-08T00:00:00.000Z");
  assert.equal(update.status, "CHANGED");
  assert.match(update.changeSummary, /名称由「试点上线」调整为「试点扩大上线」/);
  assert.match(update.changeSummary, /日期由2026-06-01调整为2026-06-08/);
});

test("buildMilestoneUpdateFromReport ignores invalid report milestone dates", () => {
  assert.equal(
    buildMilestoneUpdateFromReport(
      {
        title: "试点上线",
        dueDate: new Date("2026-06-01T00:00:00.000Z"),
        status: "PLANNED",
        changeSummary: "",
      },
      {
        milestoneTitle: "试点上线",
        milestoneDate: "bad-date",
        milestoneState: "planned",
      }
    ),
    null
  );
});

test("buildMilestoneUpdateFromReport returns null when report has no milestone changes", () => {
  assert.equal(
    buildMilestoneUpdateFromReport(
      {
        title: "试点上线",
        dueDate: new Date("2026-06-01T00:00:00.000Z"),
        status: "PLANNED",
        changeSummary: "",
      },
      {
        milestoneTitle: "试点上线",
        milestoneDate: "2026-06-01",
        milestoneState: "planned",
      }
    ),
    null
  );
});

test("toPublicProjectReportState maps updated milestones and risks for frontend refresh", () => {
  const state = toPublicProjectReportState({
    id: "project_1",
    milestones: [
      {
        id: "m1",
        title: "试点上线",
        rawText: "试点上线",
        source: "项目维护",
        dueDate: new Date("2026-06-08T00:00:00.000Z"),
        status: "CHANGED",
        changeSummary: "日期调整",
      },
    ],
    risks: [
      {
        id: "r1",
        level: "MEDIUM",
        title: "本周填报风险",
        detail: "接口阻塞",
        ownerName: "王康旭",
        dueDate: null,
        status: "OPEN",
        source: "成员填报",
      },
    ],
  });

  assert.deepEqual(state, {
    projectId: "project_1",
    milestones: [
      {
        id: "m1",
        title: "试点上线",
        raw: "试点上线",
        source: "项目维护",
        dateKey: "2026-06-08",
        status: "changed",
        changeNote: "日期调整",
      },
    ],
    risks: [
      {
        id: "r1",
        level: "medium",
        title: "本周填报风险",
        detail: "接口阻塞",
        owner: "王康旭",
        dueDate: "",
        status: "open",
        source: "成员填报",
      },
    ],
  });
});
