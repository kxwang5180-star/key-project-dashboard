import test from "node:test";
import assert from "node:assert/strict";
import { buildApiErrorMessage, formatUserFacingError, parseApiPayload } from "../../src/ui/api-response.js";

test("parseApiPayload reads json error messages", () => {
  const payload = parseApiPayload({
    text: JSON.stringify({ message: "项目不存在" }),
    contentType: "application/json; charset=utf-8",
    ok: false,
    status: 404,
  });

  assert.deepEqual(payload, { message: "项目不存在" });
  assert.equal(buildApiErrorMessage({ payload, status: 404 }), "项目不存在");
});

test("parseApiPayload identifies html deployment or api path errors", () => {
  const payload = parseApiPayload({
    text: "<!doctype html><html><body>Gateway timeout</body></html>",
    contentType: "text/html",
    ok: false,
    status: 504,
  });

  assert.deepEqual(payload, {
    message: "接口返回了 HTML 页面，可能是部署入口或 API 路径错误（HTTP 504）",
  });
});

test("parseApiPayload preserves plain text backend errors", () => {
  const payload = parseApiPayload({
    text: "飞书授权失败：当前账号没有该飞书应用的使用权限",
    contentType: "text/plain",
    ok: false,
    status: 401,
  });

  assert.equal(payload.message, "飞书授权失败：当前账号没有该飞书应用的使用权限");
});

test("buildApiErrorMessage falls back to http status for empty responses", () => {
  assert.equal(buildApiErrorMessage({ payload: null, status: 500 }), "请求失败（HTTP 500）");
});

test("formatUserFacingError converts English runtime errors to Chinese hints", () => {
  assert.equal(
    formatUserFacingError(new Error("Failed to fetch")),
    "网络连接异常，暂时无法连接服务端，请稍后重试"
  );
  assert.equal(
    formatUserFacingError(new Error("Unauthorized"), "周报保存失败，请检查内容后稍后重试"),
    "当前登录状态或权限不足，请重新登录后再试"
  );
  assert.equal(
    formatUserFacingError(new Error("PrismaClientValidationError"), "周报保存失败，请检查内容后稍后重试"),
    "周报保存失败，请检查内容后稍后重试"
  );
});
