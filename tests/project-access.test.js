import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAllowedProjectIds,
  chooseEffectiveProjectId,
} from "../src/lib/project-access.js";

test("buildAllowedProjectIds does not grant access from defaultProjectId for members", () => {
  const allowed = buildAllowedProjectIds({
    role: "MEMBER",
    membershipProjectIds: ["project_a"],
    defaultProjectId: "project_b",
    allProjectIds: ["project_a", "project_b"],
  });

  assert.deepEqual(allowed, ["project_a"]);
});

test("buildAllowedProjectIds grants all projects to admins", () => {
  const allowed = buildAllowedProjectIds({
    role: "ADMIN",
    membershipProjectIds: [],
    defaultProjectId: "project_b",
    allProjectIds: ["project_a", "project_b"],
  });

  assert.deepEqual(allowed, ["project_a", "project_b"]);
});

test("chooseEffectiveProjectId uses default only when it is allowed", () => {
  assert.equal(
    chooseEffectiveProjectId({
      defaultProjectId: "project_b",
      allowedProjectIds: ["project_a"],
    }),
    "project_a"
  );

  assert.equal(
    chooseEffectiveProjectId({
      defaultProjectId: "project_b",
      allowedProjectIds: ["project_a", "project_b"],
    }),
    "project_b"
  );
});

test("chooseEffectiveProjectId returns empty when no project is allowed", () => {
  assert.equal(
    chooseEffectiveProjectId({
      defaultProjectId: "project_b",
      allowedProjectIds: [],
    }),
    ""
  );
});
