export function toPublicProjectBrief(project) {
  return {
    id: project.id,
    owner: project.ownerName || "未填写",
    overview: project.description || "",
    stage: project.stage || "PLANNED",
    changeSummary: project.changeSummary || "",
  };
}

export function buildProjectBriefUpdatePayload(brief) {
  return {
    ownerName: String(brief?.owner || "").trim(),
    description: String(brief?.overview || "").trim(),
  };
}

export function applyProjectBriefSnapshot(project, brief) {
  if (!project || !brief) return project;
  project.owner = String(brief.owner || "").trim() || project.owner || "未填写";
  project.overallText = String(brief.overview || "").trim() || project.overallText || "";
  if (brief.stage) project.stage = brief.stage;
  return project;
}
