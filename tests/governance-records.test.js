import test from "node:test";
import assert from "node:assert/strict";
import {
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
