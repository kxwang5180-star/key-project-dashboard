import test from "node:test";
import assert from "node:assert/strict";
import { buildAuthPanelViewModel } from "../../src/ui/auth-panel.js";

test("buildAuthPanelViewModel keeps the signed-out login page focused", () => {
  const model = buildAuthPanelViewModel({ user: null, projects: [] });

  assert.equal(model.mode, "signed-out");
  assert.equal(model.title, "进入重点项目驾驶舱");
  assert.deepEqual(model.actions, [{ key: "login", label: "飞书登录进入", tone: "primary" }]);
  assert.equal(model.notes.length, 1);
  assert.deepEqual(
    model.permissions.map((item) => item.label),
    ["身份识别", "群聊同步", "群提醒"]
  );
  assert.match(model.permissions[0].value, /auth:user\.id:read/);
});

test("buildAuthPanelViewModel gives members only useful entry actions", () => {
  const model = buildAuthPanelViewModel({
    user: { name: "张三", role: "项目成员", projectId: "p2", projectIds: ["p2"], isAdmin: false },
    projects: [
      { id: "p1", shortName: "合同系统" },
      { id: "p2", shortName: "门店大脑" },
    ],
  });

  assert.equal(model.mode, "signed-in");
  assert.equal(model.defaultProjectName, "门店大脑");
  assert.deepEqual(model.actions.map((action) => action.key), ["calendar", "metrics", "report", "logout"]);
});

test("buildAuthPanelViewModel keeps identity management behind admin access", () => {
  const member = buildAuthPanelViewModel({ user: { name: "张三", role: "项目成员", canManageIdentity: false }, projects: [] });
  const admin = buildAuthPanelViewModel({ user: { name: "李四", role: "管理员", canManageIdentity: true }, projects: [] });

  assert.equal(member.showIdentityManagement, false);
  assert.equal(admin.showIdentityManagement, true);
  assert.equal(admin.actions.some((action) => action.key === "identity"), true);
});
