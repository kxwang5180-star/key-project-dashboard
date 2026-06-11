import test from "node:test";
import assert from "node:assert/strict";
import { buildAuthPanelViewModel } from "../../src/ui/auth-panel.js";

test("buildAuthPanelViewModel keeps the signed-out login page focused", () => {
  const model = buildAuthPanelViewModel({ user: null, projects: [] });

  assert.equal(model.mode, "signed-out");
  assert.equal(model.title, "进入重点项目驾驶舱");
  assert.deepEqual(model.actions, [{ key: "login", label: "飞书登录进入", tone: "primary" }]);
  assert.equal(model.notes.length, 0);
  assert.deepEqual(
    model.permissions,
    [
      { label: "人员登录", items: ["获取用户身份标识", "获取用户基本信息"] },
      { label: "王康旭", items: ["查看群信息", "查看群成员", "获取用户身份标识", "获取用户基本信息", "以应用的身份发消息"] },
    ]
  );
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
