import test from "node:test";
import assert from "node:assert/strict";
import {
  formatProjectStageLabel,
  getLatestProjectReport,
  getMilestoneReportPreview,
  getNearestMilestone,
  getVisibleCalendarEvents,
  getVisibleMilestones,
  getWeekRangeSummary,
} from "../../src/ui/report-experience.js";

test("getWeekRangeSummary returns the selected week start and end inside milestone window", () => {
  assert.equal(
    getWeekRangeSummary({
      startKey: "2026-06-01",
      endKey: "2026-06-30",
      selectedWeek: 2,
    }),
    "第2周 · 6月8日-6月14日"
  );
});

test("getVisibleCalendarEvents limits day events until the day is expanded", () => {
  const events = ["a", "b", "c", "d", "e"];

  assert.deepEqual(getVisibleCalendarEvents(events, { expanded: false, limit: 3 }), {
    visible: ["a", "b", "c"],
    hiddenCount: 2,
    isExpanded: false,
  });
  assert.deepEqual(getVisibleCalendarEvents(events, { expanded: true, limit: 3 }), {
    visible: events,
    hiddenCount: 0,
    isExpanded: true,
  });
});

test("getVisibleMilestones keeps the active milestone visible when collapsed", () => {
  const milestones = [
    { id: "m1" },
    { id: "m2" },
    { id: "m3" },
    { id: "m4" },
    { id: "m5" },
  ];

  assert.deepEqual(getVisibleMilestones(milestones, { expanded: false, limit: 3, pinnedId: "m5" }), {
    visible: [{ id: "m1" }, { id: "m2" }, { id: "m5" }],
    hiddenCount: 2,
    isExpanded: false,
  });
  assert.deepEqual(getVisibleMilestones(milestones, { expanded: true, limit: 3, pinnedId: "m5" }), {
    visible: milestones,
    hiddenCount: 0,
    isExpanded: true,
  });
});

test("getMilestoneReportPreview filters reports by milestone and supports collapsed previews", () => {
  const reports = [
    { id: "r1", projectId: "p1", milestoneId: "m1", week: 1 },
    { id: "r2", projectId: "p1", milestoneId: "m2", week: 1 },
    { id: "r3", projectId: "p1", milestoneId: "m1", week: 2, updatedAt: "2026-06-02T00:00:00.000Z" },
    { id: "r5", projectId: "p1", milestoneId: "m1", week: 2, updatedAt: "2026-06-03T00:00:00.000Z" },
    { id: "r4", projectId: "p2", milestoneId: "m1", week: 1 },
  ];

  assert.deepEqual(
    getMilestoneReportPreview(reports, {
      projectId: "p1",
      milestoneId: "m1",
      expanded: false,
      limit: 1,
    }),
    {
      reports: [
        { id: "r5", projectId: "p1", milestoneId: "m1", week: 2, updatedAt: "2026-06-03T00:00:00.000Z" },
      ],
      total: 3,
      hiddenCount: 2,
      isExpanded: false,
    }
  );
});

test("getNearestMilestone returns the dated milestone closest to today", () => {
  const nearest = getNearestMilestone(
    [
      { id: "m1", title: "较远节点", dateInfo: { date: new Date("2026-06-30T00:00:00") } },
      { id: "m2", title: "最近节点", dateInfo: { date: new Date("2026-06-06T00:00:00") } },
      { id: "m3", title: "未标日期" },
    ],
    new Date("2026-06-05T00:00:00")
  );

  assert.equal(nearest.id, "m2");
});

test("getLatestProjectReport returns the newest weekly report for a project", () => {
  const latest = getLatestProjectReport(
    [
      { id: "r1", projectId: "p1", week: 5, createdAt: "2026-06-01T00:00:00.000Z" },
      { id: "r2", projectId: "p2", week: 6, createdAt: "2026-06-04T00:00:00.000Z" },
      { id: "r3", projectId: "p1", week: 6, createdAt: "2026-06-03T00:00:00.000Z" },
      { id: "r4", projectId: "p1", week: 5, createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-05T00:00:00.000Z" },
    ],
    "p1"
  );

  assert.equal(latest.id, "r4");
});

test("formatProjectStageLabel hides raw enum stage labels", () => {
  assert.equal(formatProjectStageLabel("IN_PROGRESS"), "推进中");
  assert.equal(formatProjectStageLabel("PLANNED"), "计划中");
});
