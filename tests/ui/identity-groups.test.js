import test from "node:test";
import assert from "node:assert/strict";
import { buildProjectUserGroups } from "../../src/ui/identity-groups.js";

test("buildProjectUserGroups places a user in every allowed project group", () => {
  const { projectUsers, unassignedUsers } = buildProjectUserGroups(
    [{ id: "u1", name: "张三", projectIds: ["p1", "p2"] }],
    [{ id: "p1" }, { id: "p2" }]
  );

  assert.deepEqual(projectUsers.p1.map((user) => user.id), ["u1"]);
  assert.deepEqual(projectUsers.p2.map((user) => user.id), ["u1"]);
  assert.deepEqual(unassignedUsers, []);
});

test("buildProjectUserGroups falls back to default project id for older user payloads", () => {
  const { projectUsers } = buildProjectUserGroups(
    [{ id: "u1", name: "张三", projectId: "p1" }],
    [{ id: "p1" }]
  );

  assert.deepEqual(projectUsers.p1.map((user) => user.id), ["u1"]);
});
