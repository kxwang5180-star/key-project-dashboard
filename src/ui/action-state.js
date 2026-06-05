export function buildActionKey(action, ...parts) {
  return [action, ...parts]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(":");
}

export function isActionPending(pendingActions = {}, key) {
  return Boolean(key && pendingActions[key]);
}

export function setActionPending(pendingActions = {}, key, pending) {
  if (!key) return { ...pendingActions };
  const next = { ...pendingActions };
  if (pending) next[key] = true;
  else delete next[key];
  return next;
}
