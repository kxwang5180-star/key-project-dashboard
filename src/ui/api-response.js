export function parseApiPayload({ text = "", contentType = "", ok = false, status = 0 }) {
  const body = String(text || "");
  const type = String(contentType || "").toLowerCase();
  if (!body) return null;

  if (type.includes("application/json") || body.trim().startsWith("{")) {
    try {
      return JSON.parse(body);
    } catch {
      return {
        message: ok ? "接口返回格式异常" : `接口返回了无效 JSON（HTTP ${status || "unknown"}）`,
      };
    }
  }

  if (type.includes("text/html") || /<html|<!doctype/i.test(body)) {
    return {
      message: ok ? "接口返回格式异常" : `接口返回了 HTML 页面，可能是部署入口或 API 路径错误（HTTP ${status || "unknown"}）`,
    };
  }

  return {
    message: ok ? "接口返回格式异常" : body.trim().slice(0, 200) || `请求失败（HTTP ${status || "unknown"}）`,
  };
}

export function buildApiErrorMessage({ payload = null, status = 0 }) {
  return payload?.message || `请求失败（HTTP ${status || "unknown"}）`;
}
