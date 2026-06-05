import test from "node:test";
import assert from "node:assert/strict";
import { buildApiErrorMessage, parseApiPayload } from "../../src/ui/api-response.js";

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
