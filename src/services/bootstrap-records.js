import { toPublicProjectBrief, toPublicProjectMaintenanceState } from "./project-records.js";
import { toPublicProjectReportState } from "./report-records.js";

export function buildBootstrapProjectPayload(project) {
  const maintenanceState = toPublicProjectMaintenanceState(project);
  const reportState = toPublicProjectReportState(project);
  return {
    id: project.id,
    code: project.code || "",
    name: project.name,
    shortName: project.shortName,
    businessLine: project.businessLine,
    description: project.description || "",
    metricsSummary: project.metricsSummary || "",
    keyNodesSummary: project.keyNodesSummary || "",
    futurePlan: project.futurePlan || "",
    teamSummary: project.teamSummary || "",
    ownerName: project.ownerName || "",
    feishuChatId: project.feishuChatId || "",
    established: project.established !== false,
    isKeyProject: project.isKeyProject !== false,
    stage: project.stage || "PLANNED",
    changeSummary: project.changeSummary || "",
    brief: toPublicProjectBrief(project),
    projectState: {
      ...maintenanceState,
      risks: reportState.risks,
    },
    members: (project.members || []).map((member) => ({
      id: member.id,
      userId: member.userId || "",
      memberId: member.memberId,
      name: member.name,
      email: member.email || "",
    })),
    reports: project.reports || [],
  };
}
