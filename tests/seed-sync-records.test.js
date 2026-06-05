import test from "node:test";
import assert from "node:assert/strict";
import {
  metricSeedKey,
  milestoneSeedKey,
  planSeedRecordReconciliation,
  withoutId,
} from "../src/services/seed-sync-records.js";

test("milestoneSeedKey matches title and date across object instances", () => {
  assert.equal(
    milestoneSeedKey({ title: "【项目建设】试点落地（72店）", dueDate: new Date("2026-06-17T00:00:00.000Z") }),
    milestoneSeedKey({ title: " 【项目建设】试点落地（72店） ", dueDate: "2026-06-17T12:00:00.000Z" })
  );
});

test("metricSeedKey distinguishes duplicated metric names by target and formula", () => {
  assert.notEqual(
    metricSeedKey({ name: "商分团队洞察分析效率提升", targetValue: "上线1个月内提升30%", observation: "上线1个月口径" }),
    metricSeedKey({ name: "商分团队洞察分析效率提升", targetValue: "上线3个月内提升50%", observation: "上线3个月口径" })
  );
});

test("planSeedRecordReconciliation updates matching records and preserves dependent leftovers", () => {
  const existingRecords = [
    { id: "keep", title: "节点A", dueDate: new Date("2026-06-01T00:00:00.000Z"), _count: { reports: 1 } },
    { id: "delete", title: "节点B", dueDate: new Date("2026-06-02T00:00:00.000Z"), _count: { reports: 0 } },
    { id: "archive", title: "节点C", dueDate: new Date("2026-06-03T00:00:00.000Z"), _count: { reports: 2 } },
  ];
  const desiredRecords = [
    { title: "节点A", dueDate: new Date("2026-06-01T00:00:00.000Z") },
    { title: "节点D", dueDate: new Date("2026-06-04T00:00:00.000Z") },
  ];

  const plan = planSeedRecordReconciliation({
    existingRecords,
    desiredRecords,
    getExistingKey: milestoneSeedKey,
    getDesiredKey: milestoneSeedKey,
    relationName: "reports",
  });

  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].existing.id, "keep");
  assert.deepEqual(plan.creates, [desiredRecords[1]]);
  assert.deepEqual(plan.deleteIds, ["delete"]);
  assert.deepEqual(plan.archive.map((record) => record.id), ["archive"]);
});

test("planSeedRecordReconciliation prefers desired ids for maintenance saves", () => {
  const existingRecords = [
    { id: "m1", name: "旧指标", targetValue: "100%", observation: "旧口径", _count: { records: 1 } },
    { id: "m2", name: "同名指标", targetValue: "100%", observation: "旧口径", _count: { records: 0 } },
  ];
  const desiredRecords = [
    { id: "m1", name: "新指标", targetValue: "90%", observation: "新口径" },
  ];

  const plan = planSeedRecordReconciliation({
    existingRecords,
    desiredRecords,
    getExistingKey: metricSeedKey,
    getDesiredKey: metricSeedKey,
    relationName: "records",
    preferDesiredId: true,
  });

  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].existing.id, "m1");
  assert.deepEqual(plan.deleteIds, ["m2"]);
});

test("withoutId removes primary key before update data is sent to Prisma", () => {
  assert.deepEqual(withoutId({ id: "metric_1", name: "完成率", sortOrder: 1 }), {
    name: "完成率",
    sortOrder: 1,
  });
});
