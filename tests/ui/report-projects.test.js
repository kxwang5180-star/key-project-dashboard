import test from "node:test";
import assert from "node:assert/strict";
import { buildReportProjectPickerState, getReportableProjectsForUser } from "../../src/ui/report-projects.js";

const projects = [
  { id: "p1", shortName: "合同系统" },
  { id: "p2", shortName: "财务中台" },
  { id: "p3", shortName: "采购平台" },
];

test("getReportableProjectsForUser returns all projects for admins", () => {
  assert.deepEqual(getReportableProjectsForUser(projects, { isAdmin: true, projectIds: ["p1"] }), projects);
});

test("getReportableProjectsForUser limits members to allowed project ids", () => {
  assert.deepEqual(
    getReportableProjectsForUser(projects, { isAdmin: false, projectIds: ["p2"] }),
    [{ id: "p2", shortName: "财务中台" }]
  );
});

test("buildReportProjectPickerState hides the picker for a one-project member", () => {
  const state = buildReportProjectPickerState(projects, { isAdmin: false, projectIds: ["p2"], projectId: "p2" });

  assert.equal(state.selectedProjectId, "p2");
  assert.equal(state.shouldHidePicker, true);
  assert.equal(state.isDisabled, false);
  assert.deepEqual(state.projects, [{ id: "p2", shortName: "财务中台" }]);
});

test("buildReportProjectPickerState shows the picker only when multiple projects are available", () => {
  const state = buildReportProjectPickerState(projects, { isAdmin: false, projectIds: ["p1", "p3"], projectId: "p2" });

  assert.equal(state.selectedProjectId, "p1");
  assert.equal(state.shouldHidePicker, false);
  assert.equal(state.isDisabled, false);
  assert.deepEqual(state.projects.map((project) => project.id), ["p1", "p3"]);
});

test("buildReportProjectPickerState disables the picker when the member has no project", () => {
  const state = buildReportProjectPickerState(projects, { isAdmin: false, projectIds: [] });

  assert.equal(state.selectedProjectId, "");
  assert.equal(state.shouldHidePicker, true);
  assert.equal(state.isDisabled, true);
  assert.deepEqual(state.projects, []);
}
);
