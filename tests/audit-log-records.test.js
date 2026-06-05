import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAuditLogRecord,
  buildGovernanceAuditDetail,
  buildProjectChatAuditDetail,
  buildUserRoleAuditDetail,
} from "../src/services/audit-log-records.js";

test("buildAuditLogRecord builds a stable audit payload", () => {
  assert.deepEqual(
    buildAuditLogRecord({
      userId: "user_1",
      action: "project.metrics.update",
      targetType: "Project",
      targetId: "project_1",
      detail: { metricCount: 2 },
    }),
    {
      userId: "user_1",
      action: "project.metrics.update",
      targetType: "Project",
      targetId: "project_1",
      detail: JSON.stringify({ metricCount: 2 }),
    }
  );
});

test("buildAuditLogRecord omits empty user and detail values", () => {
  assert.deepEqual(
    buildAuditLogRecord({
      action: "project.brief.update",
      targetType: "Project",
      targetId: "project_1",
    }),
    {
      userId: null,
      action: "project.brief.update",
      targetType: "Project",
      targetId: "project_1",
      detail: null,
    }
  );
});

test("buildUserRoleAuditDetail records identity role and project changes", () => {
  assert.deepEqual(
    buildUserRoleAuditDetail({ role: "ADMIN", defaultProjectId: "project_1" }),
    { role: "ADMIN", defaultProjectId: "project_1" }
  );
});

test("buildProjectChatAuditDetail records chat and member sync context", () => {
  assert.deepEqual(
    buildProjectChatAuditDetail({ chatId: "oc_1", memberCount: 12, memberSource: "live" }),
    { chatId: "oc_1", memberCount: 12, memberSource: "live" }
  );
});

test("buildGovernanceAuditDetail records governance status and owner changes", () => {
  assert.deepEqual(
    buildGovernanceAuditDetail({ status: "doing", ownerName: "王康旭" }),
    { status: "doing", ownerName: "王康旭" }
  );
});
