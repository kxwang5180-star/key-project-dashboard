function uniqueIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || "").trim()).filter(Boolean))];
}

export function buildAllowedProjectIds({ role, membershipProjectIds = [], allProjectIds = [] }) {
  if (role === "ADMIN") return uniqueIds(allProjectIds);
  return uniqueIds(membershipProjectIds);
}

export function chooseEffectiveProjectId({ defaultProjectId = "", allowedProjectIds = [] }) {
  const allowed = uniqueIds(allowedProjectIds);
  const preferred = String(defaultProjectId || "").trim();
  if (preferred && allowed.includes(preferred)) return preferred;
  return allowed[0] || "";
}
