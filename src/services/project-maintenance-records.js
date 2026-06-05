export function resolveProjectMaintenanceAccess({
  project,
  canMaintain,
  deniedMessage = "你不在该项目群聊成员中，不能维护该项目",
}) {
  if (!project) {
    return { ok: false, status: 404, message: "项目不存在" };
  }

  if (!canMaintain) {
    return { ok: false, status: 403, message: deniedMessage };
  }

  return { ok: true };
}
