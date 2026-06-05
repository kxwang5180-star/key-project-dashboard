export function toggleExpandedKey(expanded = {}, key) {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) return expanded || {};
  return {
    ...(expanded || {}),
    [normalizedKey]: !Boolean(expanded?.[normalizedKey]),
  };
}

export function isExpandedKey(expanded = {}, key) {
  return Boolean(expanded?.[String(key || "").trim()]);
}
