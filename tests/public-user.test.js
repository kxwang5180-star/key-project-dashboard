import test from "node:test";
import assert from "node:assert/strict";
import { toPublicUser } from "../src/services/public-user.js";

test("toPublicUser exposes membership project ids and chooses an allowed default project", () => {
  const user = toPublicUser(
    {
      id: "u1",
      name: "张三",
      email: "a@example.com",
      role: "MEMBER",
      defaultProjectId: "not_allowed",
      avatarUrl: "",
      feishuOpenId: "ou_1",
    },
    ["project_a", "project_b"]
  );

  assert.deepEqual(user.projectIds, ["project_a", "project_b"]);
  assert.equal(user.projectId, "project_a");
  assert.equal(user.feishuLinked, true);
});

test("toPublicUser can receive identity admin policy without importing runtime config", () => {
  const user = toPublicUser(
    { id: "u1", name: "王康旭", email: "w@example.com", role: "ADMIN" },
    ["project_a"],
    { canManageIdentity: (item) => item.name === "王康旭" }
  );

  assert.equal(user.canManageIdentity, true);
});
