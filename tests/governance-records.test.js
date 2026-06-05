import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGovernanceTaskPersistencePlan,
  buildGovernanceTaskIdentity,
  buildGovernanceItemKey,
  normalizeGovernanceLevel,
  normalizeGovernanceStatus,
  toClientGovernanceResolution,
} from "../src/services/governance-records.js";

test("normalizeGovernanceStatus accepts frontend governance statuses", () => {
  assert.equal(normalizeGovernanceStatus("todo"), "TODO");
  assert.equal(normalizeGovernanceStatus("doing"), "DOING");
  assert.equal(normalizeGovernanceStatus("done"), "DONE");
  assert.equal(normalizeGovernanceStatus("DONE"), "DONE");
  assert.equal(normalizeGovernanceStatus("unknown"), "TODO");
});

test("normalizeGovernanceLevel accepts frontend governance levels", () => {
  assert.equal(normalizeGovernanceLevel("low"), "LOW");
  assert.equal(normalizeGovernanceLevel("medium"), "MEDIUM");
  assert.equal(normalizeGovernanceLevel("high"), "HIGH");
  assert.equal(normalizeGovernanceLevel("HIGH"), "HIGH");
  assert.equal(normalizeGovernanceLevel("unknown"), "MEDIUM");
});

test("buildGovernanceItemKey matches generated items and persisted tasks", () => {
  assert.equal(
    buildGovernanceItemKey({
      projectId: "project_1",
      taskType: "风险治理",
      title: "风险缺少责任人",
      detail: "接口联调风险",
    }),
    "project_1|风险治理|风险缺少责任人|接口联调风险"
  );
});

test("buildGovernanceTaskIdentity normalizes duplicate governance task fields", () => {
  assert.deepEqual(
    buildGovernanceTaskIdentity({
      projectId: " project_1 ",
      taskType: " 指标治理 ",
      title: " 项目指标仍需结构化 ",
      detail: " 建议补充指标名称 ",
    }),
    {
      projectId: "project_1",
      taskType: "指标治理",
      title: "项目指标仍需结构化",
      detail: "建议补充指标名称",
    }
  );
});

test("buildGovernanceTaskPersistencePlan chooses update for duplicate tasks", () => {
  assert.deepEqual(buildGovernanceTaskPersistencePlan({ existingTask: { id: "task_1" } }), {
    mode: "update",
    statusCode: 200,
    auditAction: "governance.task.upsert",
  });

  assert.deepEqual(buildGovernanceTaskPersistencePlan({ existingTask: null }), {
    mode: "create",
    statusCode: 201,
    auditAction: "governance.task.create",
  });
});

test("toClientGovernanceResolution maps persisted task to frontend resolution", () => {
  assert.deepEqual(
    toClientGovernanceResolution({
      id: "task_1",
      status: "DOING",
      ownerName: "王康旭",
    }),
    {
      taskId: "task_1",
      status: "doing",
      owner: "王康旭",
    }
  );
});
