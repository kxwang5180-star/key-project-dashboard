import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFocusedMilestonePatch,
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
