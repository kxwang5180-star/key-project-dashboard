import test from "node:test";
import assert from "node:assert/strict";
import { isExpandedKey, toggleExpandedKey } from "../../src/ui/detail-toggles.js";

test("toggleExpandedKey toggles one stable detail key without mutating source", () => {
  const source = { a: true };
  const next = toggleExpandedKey(source, "b");

  assert.deepEqual(source, { a: true });
  assert.deepEqual(next, { a: true, b: true });
  assert.equal(isExpandedKey(next, "b"), true);
  assert.deepEqual(toggleExpandedKey(next, "b"), { a: true, b: false });
});

test("toggleExpandedKey ignores empty keys", () => {
  const source = { a: true };
  assert.equal(toggleExpandedKey(source, ""), source);
});
