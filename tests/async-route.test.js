import test from "node:test";
import assert from "node:assert/strict";
import { asyncRoute } from "../src/lib/async-route.js";

test("asyncRoute forwards rejected route handlers to next", async () => {
  const error = new Error("database failed");
  let forwarded = null;
  const wrapped = asyncRoute(async () => {
    throw error;
  });

  await wrapped({}, {}, (nextError) => {
    forwarded = nextError;
  });

  assert.equal(forwarded, error);
});
