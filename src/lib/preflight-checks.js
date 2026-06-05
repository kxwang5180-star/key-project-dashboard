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
