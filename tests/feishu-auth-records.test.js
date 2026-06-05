import test from "node:test";
import assert from "node:assert/strict";
import { mapRoleFromFeishuIdentity } from "../src/services/feishu-auth-records.js";

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
