import test from "node:test";
import assert from "node:assert/strict";
import {
  buildJsonApiCheck,
  DEFAULT_API_PATHS,
  checkFeishuCallbackConfig,
  checkFeishuRedirectUri,
  checkFeishuReminderScopes,
  checkFeishuScopes,
  checkFeishuChatSyncScopes,
  checkFeishuAccessPolicy,
  checkDependencyLockfile,
  checkRuntimeDependencies,
  checkRequiredEnv,
  checkUrl,
  summarizeChecks,
} from "../src/lib/preflight-checks.js";

test("DEFAULT_API_PATHS covers frontend data connectivity sources", () => {
  assert.deepEqual(DEFAULT_API_PATHS, [
    "/api",
    "/api/health",
    "/api/auth/me",
    "/api/bootstrap",
    "/api/projects",
    "/api/reports",
    "/api/governance",
  ]);
});

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

test("checkFeishuRedirectUri requires the OAuth callback path", () => {
  assert.equal(checkFeishuRedirectUri("https://example.com/api/auth/feishu/callback").ok, true);
  const check = checkFeishuRedirectUri("https://example.com/login");
  assert.equal(check.ok, false);
  assert.match(check.message, /\/api\/auth\/feishu\/callback/);
});

test("checkFeishuScopes only requires login identity permissions", () => {
  const check = checkFeishuScopes("contact:user.base:readonly auth:user.id:read");
  assert.equal(check.ok, true);
  assert.deepEqual(check.missing, []);
  assert.match(check.message, /飞书登录权限/);
});

test("checkFeishuChatSyncScopes separately requires chat permissions", () => {
  const check = checkFeishuChatSyncScopes("contact:user.base:readonly auth:user.id:read im:chat:read");
  assert.equal(check.ok, false);
  assert.deepEqual(check.missing, ["im:chat.members:read"]);
  assert.match(check.message, /缺少飞书权限/);
});

test("checkFeishuReminderScopes only requires message permission when reminders are enabled", () => {
  assert.equal(
    checkFeishuReminderScopes({
      FEISHU_MILESTONE_REMINDERS_ENABLED: "false",
      FEISHU_SCOPES: "contact:user.base:readonly",
    }).ok,
    true
  );
  assert.equal(
    checkFeishuReminderScopes({
      FEISHU_MILESTONE_REMINDERS_ENABLED: "true",
      FEISHU_SCOPES: "contact:user.base:readonly auth:user.id:read",
      FEISHU_MESSAGE_SCOPES: "im:message:send_as_bot",
    }).ok,
    true
  );
  const check = checkFeishuReminderScopes({
    FEISHU_MILESTONE_REMINDERS_ENABLED: "true",
    FEISHU_SCOPES: "contact:user.base:readonly auth:user.id:read",
  });
  assert.equal(check.ok, false);
  assert.match(check.message, /FEISHU_MESSAGE_SCOPES/);
});

test("checkFeishuCallbackConfig requires callback settings only when reminders are enabled", () => {
  assert.equal(checkFeishuCallbackConfig({ FEISHU_MILESTONE_REMINDERS_ENABLED: "false" }).ok, true);
  const missing = checkFeishuCallbackConfig({ FEISHU_MILESTONE_REMINDERS_ENABLED: "true" });
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.missing, ["PUBLIC_BASE_URL", "FEISHU_CALLBACK_VERIFICATION_TOKEN"]);

  const check = checkFeishuCallbackConfig({
    FEISHU_MILESTONE_REMINDERS_ENABLED: "true",
    PUBLIC_BASE_URL: "https://example.com/",
    FEISHU_CALLBACK_VERIFICATION_TOKEN: "verify-token",
  });
  assert.equal(check.ok, true);
  assert.equal(check.callbackUrl, "https://example.com/api/feishu/callback");
});

test("checkFeishuCallbackConfig rejects Feishu card action urls as public base url", () => {
  const check = checkFeishuCallbackConfig({
    FEISHU_MILESTONE_REMINDERS_ENABLED: "true",
    PUBLIC_BASE_URL: "https://aily.feishu.cn/anyclaw/webhook/feishu/cli_xxx/card/action",
    FEISHU_CALLBACK_VERIFICATION_TOKEN: "verify-token",
  });
  assert.equal(check.ok, false);
  assert.match(check.message, /本系统访问地址/);
});

test("checkFeishuAccessPolicy rejects unrestricted Feishu login without an allowlist", () => {
  const check = checkFeishuAccessPolicy({
    FEISHU_ALLOW_ALL_USERS: "true",
    FEISHU_ALLOWED_EMAILS: "",
  });

  assert.equal(check.ok, false);
  assert.match(check.message, /FEISHU_ALLOW_ALL_USERS/);
});

test("checkFeishuAccessPolicy accepts restricted or allowlisted Feishu login", () => {
  assert.equal(checkFeishuAccessPolicy({ FEISHU_ALLOW_ALL_USERS: "false" }).ok, true);
  assert.equal(
    checkFeishuAccessPolicy({
      FEISHU_ALLOW_ALL_USERS: "true",
      FEISHU_ALLOWED_EMAILS: "a@example.com,b@example.com",
    }).ok,
    true
  );
});

test("checkRuntimeDependencies reports missing runtime packages", () => {
  const check = checkRuntimeDependencies(
    {
      express: "^4.19.2",
      cors: "^2.8.5",
      dotenv: "^16.4.5",
    },
    {
      resolvePackage: (name) => {
        if (name === "cors") throw new Error("missing");
        return `/node_modules/${name}/package.json`;
      },
    }
  );

  assert.equal(check.ok, false);
  assert.deepEqual(check.missing, ["cors"]);
  assert.match(check.message, /npm install/);
});

test("checkDependencyLockfile requires a committed npm lockfile for reproducible deploys", () => {
  assert.deepEqual(
    checkDependencyLockfile({
      exists: (path) => path === "package-lock.json",
    }),
    {
      name: "dependency-lockfile",
      ok: true,
      lockfile: "package-lock.json",
      message: "依赖锁文件已存在：package-lock.json",
    }
  );
  const missing = checkDependencyLockfile({ exists: () => false });
  assert.equal(missing.ok, false);
  assert.match(missing.message, /npm install --package-lock-only/);
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
