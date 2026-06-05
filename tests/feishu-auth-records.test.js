import test from "node:test";
import assert from "node:assert/strict";
import { buildFeishuAuthFailureMessage, mapRoleFromFeishuIdentity } from "../src/services/feishu-auth-records.js";

test("mapRoleFromFeishuIdentity treats default admin names as admins", () => {
  assert.equal(mapRoleFromFeishuIdentity({ name: "赵长硕", email: "" }), "ADMIN");
  assert.equal(mapRoleFromFeishuIdentity({ name: " 姚 翔宇 ", email: "" }), "ADMIN");
});

test("mapRoleFromFeishuIdentity supports configured admin identifiers", () => {
  assert.equal(mapRoleFromFeishuIdentity({ email: "Admin@Example.com" }, { adminEmails: ["admin@example.com"] }), "ADMIN");
  assert.equal(mapRoleFromFeishuIdentity({ open_id: "ou_admin" }, { adminOpenIds: ["ou_admin"] }), "ADMIN");
});

test("mapRoleFromFeishuIdentity keeps ordinary Feishu users as members", () => {
  assert.equal(mapRoleFromFeishuIdentity({ name: "普通成员", email: "" }), "MEMBER");
});

test("buildFeishuAuthFailureMessage explains Feishu app usage scope failures", () => {
  const message = buildFeishuAuthFailureMessage("access_denied", "你没有 PMO助手 的使用权限");
  assert.match(message, /飞书管理后台/);
  assert.match(message, /可用范围\/发布范围/);
});
