function hasMaintainableProjects(user = null) {
  if (!user) return false;
  if (user.isAdmin) return true;
  return Array.isArray(user.projectIds) && user.projectIds.length > 0;
}

function findDefaultProjectName(projects = [], user = null) {
  const project = projects.find((item) => item.id === user?.projectId);
  return project?.shortName || "未设置";
}

export function buildAuthPanelViewModel({ user = null, projects = [] } = {}) {
  if (!user) {
    return {
      mode: "signed-out",
      title: "进入重点项目驾驶舱",
      subtitle: "使用飞书身份登录后进入项目看板。",
      notes: [],
      actions: [{ key: "login", label: "飞书登录进入", tone: "primary" }],
      showIdentityManagement: false,
      defaultProjectName: "",
    };
  }

  const actions = [
    { key: "calendar", label: "里程碑日历", tone: "primary" },
    { key: "metrics", label: "指标看板", tone: "secondary" },
  ];
  if (hasMaintainableProjects(user)) actions.push({ key: "report", label: "项目维护", tone: "secondary" });
  if (user.canManageIdentity) actions.push({ key: "identity", label: "身份管理", tone: "secondary" });
  actions.push({ key: "logout", label: "退出登录", tone: "ghost" });

  return {
    mode: "signed-in",
    title: user.name || "已登录",
    subtitle: user.role || "成员",
    notes: [],
    actions,
    showIdentityManagement: Boolean(user.canManageIdentity),
    defaultProjectName: findDefaultProjectName(projects, user),
  };
}
