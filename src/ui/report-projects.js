import { chooseEffectiveProjectId } from "../lib/project-access.js";

export function getReportableProjectsForUser(projects = [], user = null) {
  const source = Array.isArray(projects) ? projects : [];
  if (!user || user.isAdmin) return source;
  const allowed = new Set(Array.isArray(user.projectIds) ? user.projectIds : []);
  return source.filter((project) => allowed.has(project.id));
}

export function buildReportProjectPickerState(projects = [], user = null) {
  const reportableProjects = getReportableProjectsForUser(projects, user);
  const selectedProjectId = chooseEffectiveProjectId({
    defaultProjectId: user?.projectId,
    allowedProjectIds: reportableProjects.map((project) => project.id),
  });

  return {
    projects: reportableProjects,
    selectedProjectId,
    isDisabled: reportableProjects.length === 0,
    shouldHidePicker: reportableProjects.length <= 1,
  };
}

export function hasMaintainableProjects(user = null) {
  if (!user) return false;
  if (user.isAdmin) return true;
  return Array.isArray(user.projectIds) && user.projectIds.length > 0;
}

export function resolveDefaultProjectView() {
  return "calendar";
}

export function resolveAllowedProjectView(view = "calendar", user = null) {
  const requestedView = String(view || "").trim() || "calendar";
  if (!user) return requestedView === "register" ? "register" : "register";
  if (requestedView === "register") return "register";
  if (user.isAdmin) return requestedView;
  if (requestedView === "calendar" || requestedView === "metrics") return requestedView;
  if (!hasMaintainableProjects(user)) return "calendar";
  if (requestedView === "report") return requestedView;
  return "calendar";
}

export function resolveAuthenticatedInitialProjectView(preferredView = "calendar", user = null) {
  const requestedView = String(preferredView || "").trim() || resolveDefaultProjectView();
  if (requestedView === "register") return resolveDefaultProjectView();
  return resolveAllowedProjectView(requestedView, user);
}

export function resolveProjectMaintenanceTarget(projects = [], user = null, requestedProjectId = "") {
  const targetId = String(requestedProjectId || "").trim();
  const reportableProjects = getReportableProjectsForUser(projects, user);
  const target = reportableProjects.find((project) => project.id === targetId);
  if (target) {
    return {
      ok: true,
      projectId: target.id,
      project: target,
    };
  }

  return {
    ok: false,
    projectId: "",
    project: null,
  };
}
