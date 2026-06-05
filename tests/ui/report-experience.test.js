import test from "node:test";
import assert from "node:assert/strict";
import {
  getMilestoneReportPreview,
  getVisibleCalendarEvents,
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

test("getMilestoneReportPreview filters reports by milestone and supports collapsed previews", () => {
  const reports = [
    { id: "r1", projectId: "p1", milestoneId: "m1", week: 1 },
    { id: "r2", projectId: "p1", milestoneId: "m2", week: 1 },
    { id: "r3", projectId: "p1", milestoneId: "m1", week: 2 },
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
        { id: "r3", projectId: "p1", milestoneId: "m1", week: 2 },
      ],
      total: 2,
      hiddenCount: 1,
      isExpanded: false,
    }
  );
});
