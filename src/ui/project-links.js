export function buildProjectMaintenanceHash(projectId = "") {
  const id = String(projectId || "").trim();
  if (!id) return "report";
  return `report:${encodeURIComponent(id)}`;
}

export function parseProjectMaintenanceHash(hash = "") {
  const value = String(hash || "").trim().replace(/^#/, "");
  if (value.startsWith("report:")) {
    return decodeURIComponent(value.slice("report:".length));
  }
  if (value.startsWith("reportProject=")) {
    return decodeURIComponent(value.slice("reportProject=".length));
  }
  return "";
}

export function resolveInitialProjectViewFromHash(hash = "", fallbackView = "calendar") {
  const value = String(hash || "").trim().replace(/^#/, "");
  if (value === "calendar") return "calendar";
  if (value === "metrics") return "metrics";
  if (value === "register") return "register";
  if (value === "report" || value === "member") return "report";
  if (value === "governance" || value === "pmo") return "governance";
  if (parseProjectMaintenanceHash(value)) return "report";
  return fallbackView;
}
