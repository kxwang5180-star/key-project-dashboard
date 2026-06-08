import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProjectMaintenanceHash,
  parseProjectMaintenanceHash,
  resolveInitialProjectViewFromHash,
} from "../../src/ui/project-links.js";

test("buildProjectMaintenanceHash creates a report deep link for a project", () => {
  assert.equal(buildProjectMaintenanceHash("project_1"), "report:project_1");
  assert.equal(buildProjectMaintenanceHash(" 项目 A "), "report:%E9%A1%B9%E7%9B%AE%20A");
  assert.equal(buildProjectMaintenanceHash(""), "report");
});

test("parseProjectMaintenanceHash accepts current and legacy project report hashes", () => {
  assert.equal(parseProjectMaintenanceHash("#report:project_1"), "project_1");
  assert.equal(parseProjectMaintenanceHash("report:%E9%A1%B9%E7%9B%AE%20A"), "项目 A");
  assert.equal(parseProjectMaintenanceHash("#reportProject=project_2"), "project_2");
  assert.equal(parseProjectMaintenanceHash("#calendar"), "");
});

test("resolveInitialProjectViewFromHash routes project deep links to maintenance view", () => {
  assert.equal(resolveInitialProjectViewFromHash("#report:project_1", "calendar"), "report");
  assert.equal(resolveInitialProjectViewFromHash("#reportProject=project_1", "calendar"), "report");
  assert.equal(resolveInitialProjectViewFromHash("#calendar", "calendar"), "calendar");
});
