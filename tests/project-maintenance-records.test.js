import test from "node:test";
import assert from "node:assert/strict";
import { resolveProjectMaintenanceAccess } from "../src/services/project-maintenance-records.js";

test("resolveProjectMaintenanceAccess returns 404 for missing project", () => {
  assert.deepEqual(resolveProjectMaintenanceAccess({ project: null, canMaintain: true }), {
    ok: false,
    status: 404,
    message: "项目不存在",
  });
});

test("resolveProjectMaintenanceAccess returns 403 for existing project without membership", () => {
  assert.deepEqual(resolveProjectMaintenanceAccess({ project: { id: "p1" }, canMaintain: false }), {
    ok: false,
    status: 403,
    message: "你不在该项目群聊成员中，不能维护该项目",
  });
});

test("resolveProjectMaintenanceAccess accepts a context-specific denied message", () => {
  assert.deepEqual(
    resolveProjectMaintenanceAccess({
      project: { id: "p1" },
      canMaintain: false,
      deniedMessage: "你不在该项目群聊成员中，不能提交该项目填报",
    }),
    {
      ok: false,
      status: 403,
      message: "你不在该项目群聊成员中，不能提交该项目填报",
    }
  );
});

test("resolveProjectMaintenanceAccess allows existing maintainable project", () => {
  assert.deepEqual(resolveProjectMaintenanceAccess({ project: { id: "p1" }, canMaintain: true }), {
    ok: true,
  });
});
