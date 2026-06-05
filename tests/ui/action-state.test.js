import test from "node:test";
import assert from "node:assert/strict";
import { buildActionKey, isActionPending, setActionPending } from "../../src/ui/action-state.js";

test("buildActionKey creates stable keys from action and ids", () => {
  assert.equal(buildActionKey("save-report", " p1 ", " week-1 "), "save-report:p1:week-1");
  assert.equal(buildActionKey("save-report", "", null, "p1"), "save-report:p1");
});

test("setActionPending marks and clears one action without mutating source", () => {
  const source = { existing: true };
  const pending = setActionPending(source, "save:p1", true);
  const cleared = setActionPending(pending, "save:p1", false);

  assert.deepEqual(source, { existing: true });
  assert.equal(isActionPending(pending, "save:p1"), true);
  assert.deepEqual(cleared, { existing: true });
});
