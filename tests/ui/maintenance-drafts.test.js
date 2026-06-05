import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFocusedMilestonePatch,
  getMilestoneCalendarSource,
  replaceFocusedMilestone,
  updateMetricDraftField,
  updateMilestoneDraftField,
} from "../../src/ui/maintenance-drafts.js";

test("updateMetricDraftField updates the edited metric immediately", () => {
  assert.deepEqual(
    updateMetricDraftField(
      [
        { id: "m1", current: "10%" },
        { id: "m2", current: "20%" },
      ],
      { metricId: "m1", field: "current", value: "30%" }
    ),
    [
      { id: "m1", current: "30%" },
      { id: "m2", current: "20%" },
    ]
  );
});

test("updateMilestoneDraftField keeps raw title in sync", () => {
  assert.deepEqual(
    updateMilestoneDraftField([{ id: "ms1", title: "旧节点", raw: "旧节点" }], {
      milestoneId: "ms1",
      field: "title",
      value: "新节点",
    }),
    [{ id: "ms1", title: "新节点", raw: "新节点" }]
  );
});

test("updateMilestoneDraftField preserves date keys for untouched milestones", () => {
  assert.deepEqual(
    updateMilestoneDraftField(
      [
        { id: "ms1", title: "节点一", dateInfo: { key: "2026-06-01" } },
        { id: "ms2", title: "节点二", dateInfo: { key: "2026-06-15" } },
      ],
      {
        milestoneId: "ms1",
        field: "dateKey",
        value: "2026-06-08",
      }
    ),
    [
      { id: "ms1", title: "节点一", dateInfo: { key: "2026-06-01" }, dateKey: "2026-06-08" },
      { id: "ms2", title: "节点二", dateInfo: { key: "2026-06-15" }, dateKey: "2026-06-15" },
    ]
  );
});

test("buildFocusedMilestonePatch maps focused editor date and status", () => {
  assert.deepEqual(
    buildFocusedMilestonePatch({
      title: "完成试点",
      dateKey: "2026-06-18",
      status: "in-progress",
    }),
    {
      title: "完成试点",
      raw: "完成试点",
      dateKey: "2026-06-18",
      status: "in-progress",
    }
  );
});

test("replaceFocusedMilestone patches one milestone without mutating or clearing untouched dates", () => {
  const milestones = [
    { id: "ms1", title: "节点一", raw: "节点一", dateInfo: { key: "2026-06-01" }, status: "planned" },
    { id: "ms2", title: "节点二", raw: "节点二", dateInfo: { key: "2026-06-15" }, status: "planned" },
  ];

  assert.deepEqual(
    replaceFocusedMilestone(milestones, {
      milestoneId: "ms1",
      patch: {
        title: "节点一更新",
        raw: "节点一更新",
        dateKey: "2026-06-08",
        status: "in-progress",
      },
    }),
    [
      {
        id: "ms1",
        title: "节点一更新",
        raw: "节点一更新",
        dateInfo: { key: "2026-06-01" },
        dateKey: "2026-06-08",
        status: "in-progress",
      },
      {
        id: "ms2",
        title: "节点二",
        raw: "节点二",
        dateInfo: { key: "2026-06-15" },
        dateKey: "2026-06-15",
        status: "planned",
      },
    ]
  );
  assert.equal(milestones[0].title, "节点一");
  assert.equal(milestones[1].dateKey, undefined);
});

test("getMilestoneCalendarSource uses active draft while maintaining the report project", () => {
  const official = [{ id: "ms1", title: "正式节点" }];
  const draft = [{ id: "ms2", title: "草稿节点" }];

  assert.equal(
    getMilestoneCalendarSource({
      projectId: "p1",
      reportProjectId: "p1",
      isManagingMilestones: true,
      projectMilestones: official,
      draftMilestones: draft,
    }),
    draft
  );
});

test("getMilestoneCalendarSource falls back to official milestones outside active maintenance", () => {
  const official = [{ id: "ms1", title: "正式节点" }];
  const draft = [{ id: "ms2", title: "草稿节点" }];

  assert.equal(
    getMilestoneCalendarSource({
      projectId: "p2",
      reportProjectId: "p1",
      isManagingMilestones: true,
      projectMilestones: official,
      draftMilestones: draft,
    }),
    official
  );
});
