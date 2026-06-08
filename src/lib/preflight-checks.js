export const REQUIRED_DEPLOY_ENV_KEYS = [
  "JWT_SECRET",
  "DATABASE_URL",
  "FEISHU_APP_ID",
  "FEISHU_APP_SECRET",
  "FEISHU_REDIRECT_URI",
  "FEISHU_SCOPES",
  "FEISHU_ADMIN_NAMES",
  "FEISHU_IDENTITY_ADMIN_NAMES",
];

export const DEFAULT_API_PATHS = [
  "/api",
  "/api/health",
  "/api/auth/me",
  "/api/bootstrap",
  "/api/projects",
  "/api/reports",
  "/api/governance",
];

export const REQUIRED_FEISHU_SCOPES = [
  "contact:user.base:readonly",
  "auth:user.id:read",
  "im:chat:read",
  "im:chat.members:read",
];

export const FEISHU_MESSAGE_SEND_SCOPES = [
  "im:message",
  "im:message:send_as_bot",
  "im:message:send",
];

export function checkRequiredEnv(env, keys = REQUIRED_DEPLOY_ENV_KEYS) {
  const missing = keys.filter((key) => !String(env[key] || "").trim());
  return {
    name: "required-env",
    ok: missing.length === 0,
    missing,
    message: missing.length ? `缺少环境变量：${missing.join(", ")}` : "关键环境变量已设置",
  };
}

export function checkUrl(name, value, options = {}) {
  const required = options.required !== false;
  const raw = String(value || "").trim();
  if (!raw && !required) {
    return { name, ok: true, message: `${name} 未设置，已跳过` };
  }
  try {
    const url = new URL(raw);
    const ok = url.protocol === "http:" || url.protocol === "https:";
    return {
      name,
      ok,
      value: raw,
      message: ok ? `${name} 地址有效` : `${name} 必须使用 http 或 https`,
    };
  } catch {
    return {
      name,
      ok: false,
      value: raw,
      message: `${name} 不是有效 URL`,
    };
  }
}

export function checkFeishuRedirectUri(value) {
  const baseCheck = checkUrl("FEISHU_REDIRECT_URI", value);
  if (!baseCheck.ok) return baseCheck;
  const url = new URL(baseCheck.value);
  const expectedPath = "/api/auth/feishu/callback";
  const ok = url.pathname === expectedPath;
  return {
    name: "feishu-redirect-uri",
    ok,
    value: baseCheck.value,
    message: ok
      ? "飞书回调地址路径正确"
      : `FEISHU_REDIRECT_URI 必须指向 ${expectedPath}，当前路径为 ${url.pathname || "/"}`,
  };
}

export function checkFeishuScopes(value, requiredScopes = REQUIRED_FEISHU_SCOPES) {
  const scopes = String(value || "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const missing = requiredScopes.filter((scope) => !scopes.includes(scope));
  return {
    name: "feishu-scopes",
    ok: missing.length === 0,
    missing,
    scopes,
    message: missing.length
      ? `缺少飞书权限：${missing.join(", ")}`
      : "飞书登录和群聊同步权限已覆盖",
  };
}

export function checkFeishuReminderScopes(env = {}) {
  const enabled = String(env.FEISHU_MILESTONE_REMINDERS_ENABLED || "false").trim().toLowerCase() === "true";
  const scopes = String(env.FEISHU_SCOPES || "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const hasSendScope = FEISHU_MESSAGE_SEND_SCOPES.some((scope) => scopes.includes(scope));
  const ok = !enabled || hasSendScope;
  return {
    name: "feishu-reminder-scopes",
    ok,
    enabled,
    scopes,
    message: ok
      ? enabled
        ? "里程碑群提醒发送权限已覆盖"
        : "里程碑群提醒未启用，已跳过消息发送权限检查"
      : `启用里程碑群提醒时，FEISHU_SCOPES 需包含以下任一权限：${FEISHU_MESSAGE_SEND_SCOPES.join(", ")}`,
  };
}

export function checkFeishuCallbackConfig(env = {}) {
  const enabled = String(env.FEISHU_MILESTONE_REMINDERS_ENABLED || "false").trim().toLowerCase() === "true";
  const publicBaseUrl = String(env.PUBLIC_BASE_URL || "").trim();
  const verificationToken = String(env.FEISHU_CALLBACK_VERIFICATION_TOKEN || "").trim();
  const missing = [];
  if (enabled && !publicBaseUrl) missing.push("PUBLIC_BASE_URL");
  if (enabled && !verificationToken) missing.push("FEISHU_CALLBACK_VERIFICATION_TOKEN");
  return {
    name: "feishu-callback-config",
    ok: missing.length === 0,
    enabled,
    missing,
    callbackUrl: publicBaseUrl ? new URL("/api/feishu/callback", publicBaseUrl).toString() : "",
    message: missing.length
      ? `启用里程碑群提醒时，需补充回调配置：${missing.join(", ")}`
      : enabled
        ? "飞书卡片回调配置已覆盖"
        : "里程碑群提醒未启用，已跳过卡片回调配置检查",
  };
}

export function checkFeishuAccessPolicy(env = {}) {
  const allowAllUsers = String(env.FEISHU_ALLOW_ALL_USERS || "true").trim().toLowerCase() === "true";
  const allowedEmails = String(env.FEISHU_ALLOWED_EMAILS || "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const ok = !allowAllUsers || allowedEmails.length > 0;
  return {
    name: "feishu-access-policy",
    ok,
    allowAllUsers,
    allowedEmailCount: allowedEmails.length,
    message: ok
      ? "飞书登录访问策略已收敛"
      : "FEISHU_ALLOW_ALL_USERS=true 且 FEISHU_ALLOWED_EMAILS 为空，生产环境会放开所有飞书账号登录；请关闭全量放行或配置白名单",
  };
}

export function checkRuntimeDependencies(dependencies = {}, options = {}) {
  const resolvePackage = options.resolvePackage || (() => "");
  const names = Object.keys(dependencies);
  const missing = [];
  for (const name of names) {
    try {
      resolvePackage(name);
    } catch {
      missing.push(name);
    }
  }
  return {
    name: "runtime-dependencies",
    ok: missing.length === 0,
    missing,
    message: missing.length
      ? `缺少运行时依赖：${missing.join(", ")}。请先执行 npm install`
      : "运行时依赖可解析",
  };
}

export function checkDependencyLockfile(options = {}) {
  const exists = options.exists || (() => false);
  const lockfiles = ["package-lock.json", "npm-shrinkwrap.json"];
  const lockfile = lockfiles.find((path) => exists(path));
  return {
    name: "dependency-lockfile",
    ok: Boolean(lockfile),
    lockfile: lockfile || "",
    message: lockfile
      ? `依赖锁文件已存在：${lockfile}`
      : "缺少依赖锁文件。请执行 npm install --package-lock-only 并提交 package-lock.json，确保部署依赖可复现",
  };
}

export function buildJsonApiCheck(path, response) {
  const contentType = String(response.contentType || "").toLowerCase();
  const isJson = contentType.includes("application/json");
  const ok = response.status >= 200 && response.status < 500 && isJson;
  const htmlTip = contentType.includes("text/html") || String(response.bodyPreview || "").trim().startsWith("<")
    ? "接口返回 HTML，可能是部署入口、反向代理或 API 路径错误"
    : "";
  return {
    name: `api-json:${path}`,
    ok,
    path,
    status: response.status,
    contentType: response.contentType || "",
    message: ok
      ? `${path} 返回 JSON`
      : htmlTip || `${path} 返回异常：HTTP ${response.status || "unknown"} ${response.contentType || ""}`.trim(),
  };
}

export function summarizeChecks(checks) {
  const passed = checks.filter((check) => check.ok).length;
  const failed = checks.length - passed;
  return {
    ok: failed === 0,
    passed,
    failed,
  };
}
