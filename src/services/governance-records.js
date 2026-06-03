const clientStatusMap = {
  TODO: "todo",
  DOING: "doing",
  DONE: "done",
};

export function normalizeGovernanceStatus(status) {
  const value = String(status || "").trim();
  const upperValue = value.toUpperCase();
  const statusMap = {
    todo: "TODO",
    doing: "DOING",
    done: "DONE",
  };
  return statusMap[value] || statusMap[value.toLowerCase()] || (["TODO", "DOING", "DONE"].includes(upperValue) ? upperValue : "TODO");
}

export function buildGovernanceItemKey(item) {
  return [
    item.projectId || item.project?.id || "",
    item.taskType || item.type || "",
    item.title || "",
    item.detail || "",
  ]
    .map((part) => String(part || "").trim())
    .join("|");
}

export function toClientGovernanceResolution(task) {
  return {
    taskId: task.id,
    status: clientStatusMap[task.status] || "todo",
    owner: String(task.ownerName || "").trim(),
  };
}
