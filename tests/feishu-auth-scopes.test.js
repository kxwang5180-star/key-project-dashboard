import test from "node:test";
import assert from "node:assert/strict";

test("buildFeishuAuthorizeUrl requests only login identity scopes by default", async () => {
  const originalEnv = {
    JWT_SECRET: process.env.JWT_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    FEISHU_APP_ID: process.env.FEISHU_APP_ID,
    FEISHU_APP_SECRET: process.env.FEISHU_APP_SECRET,
    FEISHU_REDIRECT_URI: process.env.FEISHU_REDIRECT_URI,
    FEISHU_SCOPES: process.env.FEISHU_SCOPES,
  };
  process.env.JWT_SECRET = "test-secret";
  process.env.DATABASE_URL = "file:./test.db";
  process.env.FEISHU_APP_ID = "cli_test";
  process.env.FEISHU_APP_SECRET = "secret_test";
  process.env.FEISHU_REDIRECT_URI = "https://example.com/api/auth/feishu/callback";
  delete process.env.FEISHU_SCOPES;

  try {
    const { buildFeishuAuthorizeUrl } = await import(`../src/lib/feishu.js?scope-test=${Date.now()}`);
    const url = new URL(buildFeishuAuthorizeUrl("state_test"));
    const scopes = url.searchParams.get("scope").split(" ");

    assert.deepEqual(scopes, ["contact:user.base:readonly", "auth:user.id:read"]);
    assert.equal(scopes.includes("im:chat:read"), false);
    assert.equal(scopes.includes("im:chat.members:read"), false);
    assert.equal(scopes.includes("im:message"), false);
  } finally {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("selectFeishuLoginScopes strips chat and message scopes from legacy env values", async () => {
  const { selectFeishuLoginScopes } = await import(`../src/lib/feishu.js?scope-filter-test=${Date.now()}`);
  const scopes = selectFeishuLoginScopes([
    "contact:user.base:readonly",
    "auth:user.id:read",
    "im:chat:read",
    "im:chat.members:read",
    "im:message",
  ]);

  assert.deepEqual(scopes, ["contact:user.base:readonly", "auth:user.id:read"]);
});

test("buildFeishuAuthorizeUrl filters legacy scopes unless extended scopes are explicitly allowed", async () => {
  const { buildFeishuAuthorizeUrl } = await import(`../src/lib/feishu.js?scope-url-filter-test=${Date.now()}`);
  const legacyScopes = [
    "contact:user.base:readonly",
    "auth:user.id:read",
    "im:chat:read",
    "im:chat.members:read",
    "im:message",
  ];

  const loginUrl = new URL(buildFeishuAuthorizeUrl("state_test", legacyScopes));
  assert.deepEqual(loginUrl.searchParams.get("scope").split(" "), ["contact:user.base:readonly", "auth:user.id:read"]);

  const chatSyncUrl = new URL(buildFeishuAuthorizeUrl("state_test", legacyScopes, { allowExtendedScopes: true }));
  assert.deepEqual(chatSyncUrl.searchParams.get("scope").split(" "), legacyScopes);
});
