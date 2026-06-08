import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReportProjectPickerState,
  getReportableProjectsForUser,
  resolveAllowedProjectView,
  resolveAuthenticatedInitialProjectView,
  resolveDefaultProjectView,
  resolveProjectMaintenanceTarget,
} from "../../src/ui/report-projects.js";

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

test("resolveProjectMaintenanceTarget allows admins to open any project", () => {
  assert.deepEqual(resolveProjectMaintenanceTarget(projects, { isAdmin: true, projectIds: [] }, "p3"), {
    ok: true,
    projectId: "p3",
    project: { id: "p3", shortName: "采购平台" },
  });
});

test("resolveProjectMaintenanceTarget limits members to maintainable projects", () => {
  assert.deepEqual(resolveProjectMaintenanceTarget(projects, { isAdmin: false, projectIds: ["p2"] }, "p2"), {
    ok: true,
    projectId: "p2",
    project: { id: "p2", shortName: "财务中台" },
  });
  assert.deepEqual(resolveProjectMaintenanceTarget(projects, { isAdmin: false, projectIds: ["p2"] }, "p1"), {
    ok: false,
    projectId: "",
    project: null,
  });
});

test("resolveDefaultProjectView opens the calendar first after login", () => {
  assert.equal(resolveDefaultProjectView({ isAdmin: true, projectIds: ["p1"] }), "calendar");
  assert.equal(resolveDefaultProjectView({ isAdmin: false, projectIds: ["p1"] }), "calendar");
  assert.equal(resolveDefaultProjectView({ isAdmin: false, projectIds: [] }), "calendar");
});

test("resolveAllowedProjectView limits non-project members to the calendar", () => {
  const user = { isAdmin: false, projectIds: [] };

  assert.equal(resolveAllowedProjectView("dashboard", user), "calendar");
  assert.equal(resolveAllowedProjectView("report", user), "calendar");
  assert.equal(resolveAllowedProjectView("governance", user), "calendar");
  assert.equal(resolveAllowedProjectView("calendar", user), "calendar");
  assert.equal(resolveAllowedProjectView("register", user), "register");
});

test("resolveAllowedProjectView lets project members maintain projects but not open admin views", () => {
  const user = { isAdmin: false, projectIds: ["p2"] };

  assert.equal(resolveAllowedProjectView("report", user), "report");
  assert.equal(resolveAllowedProjectView("calendar", user), "calendar");
  assert.equal(resolveAllowedProjectView("register", user), "register");
  assert.equal(resolveAllowedProjectView("dashboard", user), "calendar");
  assert.equal(resolveAllowedProjectView("governance", user), "calendar");
});

test("resolveAuthenticatedInitialProjectView treats the login page as a calendar entry after auth", () => {
  assert.equal(resolveAuthenticatedInitialProjectView("register", { isAdmin: true, projectIds: [] }), "calendar");
  assert.equal(resolveAuthenticatedInitialProjectView("register", { isAdmin: false, projectIds: ["p2"] }), "calendar");
  assert.equal(resolveAuthenticatedInitialProjectView("register", { isAdmin: false, projectIds: [] }), "calendar");
});

test("resolveAuthenticatedInitialProjectView preserves explicit maintainable report links", () => {
  assert.equal(resolveAuthenticatedInitialProjectView("report", { isAdmin: false, projectIds: ["p2"] }), "report");
  assert.equal(resolveAuthenticatedInitialProjectView("report", { isAdmin: false, projectIds: [] }), "calendar");
});
