import test from "node:test";
import assert from "node:assert/strict";
import { resolveIdentityUserRegistration, resolveIdentityUserUpdate } from "../src/services/identity-user-records.js";

test("resolveIdentityUserUpdate requires an existing user", () => {
  assert.deepEqual(resolveIdentityUserUpdate({ user: null, role: "MEMBER", project: null }), {
    ok: false,
    status: 404,
    message: "用户不存在",
  });
});

test("resolveIdentityUserUpdate rejects unknown default projects", () => {
  assert.deepEqual(
    resolveIdentityUserUpdate({
      user: { id: "u1" },
      role: "ADMIN",
      defaultProjectId: "project_missing",
      project: null,
    }),
    {
      ok: false,
      status: 400,
      message: "默认项目不存在",
    }
  );
});

test("resolveIdentityUserUpdate normalizes role and default project", () => {
  assert.deepEqual(
    resolveIdentityUserUpdate({
      user: { id: "u1" },
      role: "ADMIN",
      defaultProjectId: " project_1 ",
      project: { id: "project_1" },
    }),
    {
      ok: true,
      role: "ADMIN",
      defaultProjectId: "project_1",
    }
  );
  assert.deepEqual(
    resolveIdentityUserUpdate({
      user: { id: "u1" },
      role: "unknown",
      defaultProjectId: "",
      project: null,
    }),
    {
      ok: true,
      role: "MEMBER",
      defaultProjectId: null,
    }
  );
});

test("resolveIdentityUserRegistration rejects unknown default projects", () => {
  assert.deepEqual(
    resolveIdentityUserRegistration({
      defaultProjectId: "project_missing",
      project: null,
    }),
    {
      ok: false,
      status: 400,
      message: "默认项目不存在",
    }
  );
});

test("resolveIdentityUserRegistration normalizes optional default project", () => {
  assert.deepEqual(
    resolveIdentityUserRegistration({
      defaultProjectId: " project_1 ",
      project: { id: "project_1" },
    }),
    {
      ok: true,
      defaultProjectId: "project_1",
    }
  );
  assert.deepEqual(resolveIdentityUserRegistration({ defaultProjectId: "", project: null }), {
    ok: true,
    defaultProjectId: null,
  });
});
