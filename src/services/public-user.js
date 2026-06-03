import { chooseEffectiveProjectId } from "../lib/project-access.js";

export function toPublicUser(user, allowedProjectIds = [], options = {}) {
  const canManageIdentity = options.canManageIdentity || (() => false);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleKey: user.role,
    defaultProjectId: user.defaultProjectId,
    projectId: chooseEffectiveProjectId({
      defaultProjectId: user.defaultProjectId,
      allowedProjectIds,
    }),
    projectIds: allowedProjectIds,
    avatarUrl: user.avatarUrl || null,
    feishuLinked: Boolean(user.feishuOpenId || user.feishuUnionId),
    canManageIdentity: canManageIdentity(user),
  };
}
