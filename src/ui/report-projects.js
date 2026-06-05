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
