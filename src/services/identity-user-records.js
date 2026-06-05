export function normalizeIdentityRole(role) {
  return String(role || "").trim().toUpperCase() === "ADMIN" ? "ADMIN" : "MEMBER";
}

export function resolveIdentityUserRegistration({ defaultProjectId = null, project = null }) {
  const normalizedProjectId = String(defaultProjectId || "").trim();
  if (normalizedProjectId && !project) {
    return { ok: false, status: 400, message: "默认项目不存在" };
  }
  return {
    ok: true,
    defaultProjectId: normalizedProjectId || null,
  };
}

export function resolveIdentityUserUpdate({ user, role, defaultProjectId = null, project = null }) {
  if (!user) {
    return { ok: false, status: 404, message: "用户不存在" };
  }

  const normalizedProjectId = String(defaultProjectId || "").trim();
  if (normalizedProjectId && !project) {
    return { ok: false, status: 400, message: "默认项目不存在" };
  }

  return {
    ok: true,
    role: normalizeIdentityRole(role),
    defaultProjectId: normalizedProjectId || null,
  };
}
