function text(value) {
  return String(value || "").trim();
}

export function mapBootstrapProjectToSourceRow(project = {}) {
  return {
    id: text(project.id),
    name: text(project.name),
    shortName: text(project.shortName),
    businessLine: text(project.businessLine),
    overallText: text(project.description),
    metricsText: text(project.metricsSummary),
    mayKeyNodes: text(project.keyNodesSummary),
    futureMilestones: text(project.futurePlan),
    teamText: text(project.teamSummary),
    owner: text(project.ownerName),
    established: project.established === false ? "否" : "是",
    isKeyProject: project.isKeyProject === false ? "否" : "是",
    feishuChatId: text(project.feishuChatId),
    stageCode: text(project.stage),
  };
}

export function mergeBootstrapProjects(staticRows = [], bootstrapProjects = [], options = {}) {
  if (options.preferBootstrap && Array.isArray(bootstrapProjects)) {
    return bootstrapProjects.map(mapBootstrapProjectToSourceRow);
  }
  if (Array.isArray(bootstrapProjects) && bootstrapProjects.length) {
    return bootstrapProjects.map(mapBootstrapProjectToSourceRow);
  }
  return Array.isArray(staticRows) ? staticRows : [];
}
