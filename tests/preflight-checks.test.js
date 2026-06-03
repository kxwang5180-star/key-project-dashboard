import test from "node:test";
import assert from "node:assert/strict";
import {
  buildJsonApiCheck,
  checkRequiredEnv,
  checkUrl,
  summarizeChecks,
} from "../src/lib/preflight-checks.js";

test("checkRequiredEnv reports missing required values without leaking secrets", () => {
  const check = checkRequiredEnv(
    {
      JWT_SECRET: "set",
      DATABASE_URL: "",
      FEISHU_APP_SECRET: "secret-value",
    },
    ["JWT_SECRET", "DATABASE_URL", "FEISHU_APP_SECRET"]
  );

  assert.equal(check.ok, false);
  assert.deepEqual(check.missing, ["DATABASE_URL"]);
  assert.equal(JSON.stringify(check).includes("secret-value"), false);
});

test("checkUrl rejects unsafe or malformed deployment URLs", () => {
  assert.equal(checkUrl("PUBLIC_BASE_URL", "http://example.com").ok, true);
  assert.equal(checkUrl("PUBLIC_BASE_URL", "https://example.com").ok, true);
  assert.equal(checkUrl("PUBLIC_BASE_URL", "ftp://example.com").ok, false);
  assert.equal(checkUrl("PUBLIC_BASE_URL", "not a url").ok, false);
});

test("buildJsonApiCheck marks HTML API responses as failed", () => {
  const check = buildJsonApiCheck("/api/auth/me", {
    status: 504,
    contentType: "text/html",
    bodyPreview: "<html>Gateway Timeout</html>",
  });

  assert.equal(check.ok, false);
  assert.equal(check.status, 504);
  assert.match(check.message, /返回 HTML/);
});

test("summarizeChecks returns a failing summary when any check fails", () => {
  const summary = summarizeChecks([
    { ok: true, name: "A" },
    { ok: false, name: "B" },
  ]);

  assert.deepEqual(summary, {
    ok: false,
    passed: 1,
    failed: 1,
  });
});
