import { mergeChatMembers, renderChatMemberChips } from "./src/ui/chat-members.js";
import { chooseEffectiveProjectId } from "./src/lib/project-access.js";
import { applyProjectBriefSnapshot, buildProjectBriefUpdatePayload } from "./src/services/project-records.js";
import {
  buildGovernanceItemKey,
  normalizeGovernanceStatus,
  toClientGovernanceResolution,
} from "./src/services/governance-records.js";
import {
  buildFocusedMilestonePatch,
  getMilestoneCalendarSource,
  replaceFocusedMilestone,
  updateMetricDraftField,
  updateMilestoneDraftField,
} from "./src/ui/maintenance-drafts.js";
import {
  formatMilestoneChangeSummary,
  formatMilestoneStatusLabel,
  formatProjectStageLabel,
  getLatestProjectReport,
  getMilestoneReportPreview,
  getNearestMilestone,
  getProjectReportHistory,
  getVisibleCalendarEvents,
  getVisibleMilestones,
  getWeekRangeSummary,
} from "./src/ui/report-experience.js";
import { hasMeaningfulReportProgress } from "./src/services/report-records.js";
import { mergeBootstrapProjects } from "./src/ui/project-bootstrap.js";
import { buildProjectUserGroups } from "./src/ui/identity-groups.js";
import {
  buildReportProjectPickerState,
  getReportableProjectsForUser,
  hasMaintainableProjects,
  resolveAllowedProjectView,
  resolveAuthenticatedInitialProjectView,
  resolveDefaultProjectView,
  resolveProjectMaintenanceTarget,
} from "./src/ui/report-projects.js";
import { buildActionKey, isActionPending, setActionPending } from "./src/ui/action-state.js";
import { buildApiErrorMessage, formatUserFacingError, parseApiPayload } from "./src/ui/api-response.js";
import { buildAuthPanelViewModel } from "./src/ui/auth-panel.js";
import { buildDataHealthModel } from "./src/ui/data-health.js";
import { isExpandedKey, toggleExpandedKey } from "./src/ui/detail-toggles.js";
import { getMetricTargetStatus } from "./src/ui/metric-status.js";
import { buildMetricTargetDetail } from "./src/ui/metric-display.js";
import { buildMetricDashboardModel } from "./src/ui/metric-dashboard.js";
import { PROJECT_METRIC_SOURCE_VERSION, shouldUseSavedMetrics } from "./src/ui/metric-source.js";
import { splitMetricObservation } from "./src/services/metric-observation.js";
import { buildWeeklyReportSaveNotice } from "./src/ui/report-save-notice.js";
import {
  buildProjectMaintenanceHash,
  parseProjectMaintenanceHash,
  resolveInitialProjectViewFromHash,
} from "./src/ui/project-links.js";

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const DEFAULT_MONTH = TODAY.getMonth() + 1;
const DEFAULT_YEAR = TODAY.getFullYear();
const CYCLE_START = new Date("2026-04-01T00:00:00");
const CURRENT_REPORT_WEEK = getCurrentReportWeek();

const state = {
  filter: "all",
  businessLine: "all",
  selectedId: null,
  currentView: getInitialView(),
  calendarYear: DEFAULT_YEAR,
  calendarMonth: DEFAULT_MONTH,
  calendarProject: "all",
  detailTab: "overview",
  metricEditMode: false,
  milestoneManageMode: false,
  briefEditMode: false,
  selectedReportMilestoneId: null,
  selectedWeek: CURRENT_REPORT_WEEK,
  milestoneEditMode: false,
  risksExpanded: false,
  selectedMilestone: null,
  pendingMilestoneScrollId: null,
  saveNotice: "",
  reportSubmitting: false,
  dataSource: "static",
  pendingActions: {},
  expandedCalendarDays: {},
  expandedProjectMilestones: {},
  expandedMilestoneReports: {},
  expandedMetricDetails: {},
  expandedSubmissionDetails: {},
  governanceLevel: "all",
  governanceType: "all",
  chatPickerOpen: false,
  chatPickerProjectId: "",
  chatSearch: "",
  chatSearchComposing: false,
  expandedProjectGroups: {},
  expandedChatMembers: {},
  identityManageOpen: false,
  projectCreateDraft: {
    name: "",
    shortName: "",
    businessLine: "",
  },
  userEditModalOpen: false,
  userEditTargetId: null,
};

const sourceRows = Array.isArray(window.PROJECT_SOURCE) ? window.PROJECT_SOURCE : [];
const sourceMetricRows = Array.isArray(window.PROJECT_METRIC_SOURCE) ? window.PROJECT_METRIC_SOURCE : [];
let projectMaintenance = loadProjectMaintenance();

function safeLocalStorageGet(key, fallback = null) {
  try { const raw = localStorage.getItem(key); return raw != null ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}

function safeLocalStorageSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota exceeded or private mode */ }
}

function loadProjectMaintenance() {
  const data = safeLocalStorageGet("project-dashboard-maintenance", {});
  return Object.fromEntries(Object.entries(data || {}).map(([projectId, entry]) => {
    if (!entry || typeof entry !== "object") return [projectId, entry];
    if (Array.isArray(entry.milestones)) {
      entry.milestones = entry.milestones.map((milestone) => ({
        ...milestone,
        status: migrateMilestoneStatus(String(milestone.status || "")),
      }));
    }
    return [projectId, entry];
  }));
}

function migrateMilestoneStatus(status) {
  const oldToNew = { done: "completed", doing: "in-progress", due: "upcoming", risk: "overdue" };
  return oldToNew[status] || status;
}
let memberProfile = null;
let submissions = [];
let governanceTasks = [];
const authState = {
  loading: true,
  error: "",
  bindingError: "",
  chatSyncErrors: [],
  users: [],
  chats: [],
  chatSyncing: false,
  usersRefreshing: false,
  chatsRefreshing: false,
};
const draftStore = {
  briefs: {},
  metrics: {},
  milestones: {},
};

function getInitialView() {
  return resolveInitialProjectViewFromHash(window.location.hash, resolveDefaultProjectView());
}

function getInitialMaintenanceProjectId() {
  return parseProjectMaintenanceHash(window.location.hash);
}

function getViewHash(view) {
  if (view === "calendar") return "calendar";
  if (view === "metrics") return "metrics";
  if (view === "register") return "register";
  if (view === "report") return "report";
  if (view === "governance") return "governance";
  return "";
}

function getAllowedView(view) {
  return resolveAllowedProjectView(view, memberProfile);
}

function getCurrentReportWeek() {
  const diffDays = Math.floor((TODAY - CYCLE_START) / 86400000) + 1;
  return Math.min(12, Math.max(1, Math.ceil(diffDays / 7)));
}

const filters = [
  { key: "all", label: "全部" },
  { key: "normal", label: "正常" },
  { key: "watch", label: "关注" },
  { key: "risk", label: "风险" },
];

const statusMap = {
  normal: { label: "正常", className: "status-normal" },
  watch: { label: "关注", className: "status-watch" },
  risk: { label: "风险", className: "status-risk" },
};

const milestoneStatusMap = {
  completed: "已完成",
  "in-progress": "进行中",
  upcoming: "临近",
  overdue: "逾期",
  changed: "变更",
  planned: "计划中",
};

function getMilestoneReports(projectId, milestoneId) {
  return submissions
    .filter((report) => report.projectId === projectId && report.milestoneId === milestoneId)
    .sort((a, b) => {
      const weekDiff = (Number(b.week) || 0) - (Number(a.week) || 0);
      if (weekDiff) return weekDiff;
      return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    });
}

function getMilestoneReportBadge(projectId, milestoneId) {
  const count = getMilestoneReports(projectId, milestoneId).length;
  if (!count) return "";
  return `<span class="calendar-update-badge">${count > 1 ? `${count}条更新` : "有更新"}</span>`;
}

const editableMilestoneStatusMap = {
  planned: "计划中",
  "in-progress": "进行中",
  completed: "已完成",
  changed: "变更",
};

const weekLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

const PROJECT_COLORS = [
  "#2563eb",
  "#059669",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#4f46e5",
  "#0d9488",
  "#65a30d",
  "#9333ea",
  "#0284c7",
  "#16a34a",
  "#c026d3",
  "#14b8a6",
  "#6366f1",
  "#0ea5e9",
  "#ca8a04",
  "#047857",
  "#6d28d9",
  "#0369a1",
  "#be185d",
  "#4338ca",
  "#15803d",
  "#0f766e",
  "#86198f",
];

const teamRoles = [
  { key: "product", label: "产品", pattern: /产品人数[：:][ \t]*([^\n]*)/, icon: "product" },
  { key: "test", label: "测试", pattern: /测试人数[：:][ \t]*([^\n]*)/, icon: "test" },
  { key: "dev", label: "开发", pattern: /开发人数[：:][ \t]*([^\n]*)/, icon: "dev" },
  { key: "algo", label: "算法", pattern: /算法人数（如有）[：:][ \t]*([^\n]*)/, icon: "algo" },
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanProjectName(name) {
  return String(name || "")
    .replace(/[【】]/g, "")
    .replace(/项目$/, "")
    .trim();
}

function canonicalProjectName(name) {
  const aliases = {
    合同系统: "合同管理系统",
    大排档赋值台计数: "大排档赋值计数",
  };
  const cleanName = cleanProjectName(name);
  return aliases[cleanName] || cleanName;
}

function compactText(text, maxLength = 86) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return "暂无";
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function getDisplayInitials(name) {
  const chars = Array.from(String(name || "").trim());
  return chars.slice(-2).join("") || "未填";
}

function getUserContactLabel(user) {
  const email = String(user?.email || "").trim();
  if (!email || email.endsWith("@local.invalid")) return user?.feishuLinked ? "飞书身份已绑定" : "未获取到邮箱";
  return email;
}

function sortUsersByName(users) {
  return [...users].sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "zh-CN"));
}

function getRoleLabel(role) {
  return role === "ADMIN" ? "管理员" : "项目成员";
}

function beginAction(key) {
  if (isActionPending(state.pendingActions, key)) return false;
  state.pendingActions = setActionPending(state.pendingActions, key, true);
  return true;
}

function finishAction(key) {
  state.pendingActions = setActionPending(state.pendingActions, key, false);
}

function actionAttrs(key) {
  return isActionPending(state.pendingActions, key) ? ' disabled aria-busy="true"' : "";
}

function normalizeAuthenticatedUser(user) {
  if (!user) return null;
  const projectIds = Array.isArray(user.projectIds) ? user.projectIds : [];
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: getRoleLabel(user.role),
    roleKey: user.role === "ADMIN" ? "ADMIN" : "MEMBER",
    projectIds,
    projectId: chooseEffectiveProjectId({
      defaultProjectId: user.defaultProjectId || user.projectId,
      allowedProjectIds: projectIds,
    }),
    avatarUrl: user.avatarUrl || "",
    feishuLinked: Boolean(user.feishuLinked),
    isAdmin: user.role === "ADMIN",
    canManageIdentity: Boolean(user.canManageIdentity),
  };
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";
  const payload = parseApiPayload({ text, contentType, ok: response.ok, status: response.status });
  if (!response.ok) {
    const error = new Error(buildApiErrorMessage({ payload, status: response.status }));
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function loadCurrentUser() {
  authState.loading = true;
  authState.error = "";
  try {
    const payload = await apiRequest("/api/auth/me");
    memberProfile = normalizeAuthenticatedUser(payload.user);
    const preferredView = getInitialView();
    const linkedProjectId = getInitialMaintenanceProjectId();
    if (memberProfile) {
      state.currentView = resolveAuthenticatedInitialProjectView(preferredView, memberProfile);
      window.location.hash = getViewHash(state.currentView);
    }
    if (memberProfile?.projectId) {
      const reportProjectSelect = document.querySelector("#reportProjectSelect");
      if (reportProjectSelect) reportProjectSelect.value = memberProfile.projectId;
    }
    if (memberProfile) {
      await loadBootstrapData();
      if (linkedProjectId && state.currentView === "report") {
        const target = resolveProjectMaintenanceTarget(projects, memberProfile, linkedProjectId);
        if (target.ok) {
          state.selectedId = target.projectId;
          memberProfile.projectId = target.projectId;
          window.location.hash = buildProjectMaintenanceHash(target.projectId);
        } else {
          state.saveNotice = "你没有该项目的维护权限。";
          window.location.hash = getViewHash(state.currentView);
        }
      }
    }
    if (memberProfile?.canManageIdentity) {
      await loadFeishuChats();
      await loadRoleBindings();
    } else {
      authState.users = [];
      authState.chats = [];
    }
  } catch (error) {
    if (error.status === 401) {
      memberProfile = null;
      authState.users = [];
      submissions = [];
      authState.error = "";
    } else {
      authState.error = error.message;
    }
  } finally {
    authState.loading = false;
  }
}

async function loadRoleBindings() {
  if (!memberProfile?.canManageIdentity) {
    authState.users = [];
    return;
  }
  const payload = await apiRequest("/api/auth/users");
  authState.users = payload.users || [];
}

async function loadProjectChatBindings() {
  const payload = await apiRequest("/api/projects");
  const serverProjects = Array.isArray(payload) ? payload : [];
  serverProjects.forEach((serverProject) => {
    const project = projects.find((item) => item.id === serverProject.id);
    if (!project) return;
    project.feishuChatId = serverProject.feishuChatId || "";
    project.owner = serverProject.ownerName || project.owner;
    project.overallText = serverProject.description || project.overallText;
  });
}

function pruneProjectScopedState() {
  const allowedIds = new Set(projects.map((project) => project.id));
  projectMaintenance = Object.fromEntries(
    Object.entries(projectMaintenance).filter(([projectId]) => projectId.startsWith("__") || allowedIds.has(projectId))
  );
  Object.keys(draftStore.briefs).forEach((projectId) => {
    if (!allowedIds.has(projectId)) delete draftStore.briefs[projectId];
  });
  Object.keys(draftStore.metrics).forEach((projectId) => {
    if (!allowedIds.has(projectId)) delete draftStore.metrics[projectId];
  });
  Object.keys(draftStore.milestones).forEach((projectId) => {
    if (!allowedIds.has(projectId)) delete draftStore.milestones[projectId];
  });
  persistProjectMaintenance();
}

function applyBootstrapPayload(payload) {
  state.dataSource = "server";
  const bootstrapRows = mergeBootstrapProjects(sourceRows, payload?.projects || [], { preferBootstrap: true });
  projects = buildProjects(bootstrapRows);
  applyProjectMaintenance();
  (payload?.projects || []).forEach((projectPayload) => {
    const project = projects.find((item) => item.id === projectPayload.id);
    if (!project) return;
    if (projectPayload.brief) applyProjectBriefSnapshot(project, projectPayload.brief);
    if (projectPayload.projectState) applyProjectReportState(projectPayload.projectState);
  });
  submissions = (payload?.projects || []).flatMap((project) => project.reports || []);
  governanceTasks = Array.isArray(payload?.governanceTasks) ? payload.governanceTasks : [];
  if (!projects.some((project) => project.id === state.selectedId)) {
    state.selectedId = projects[0]?.id || null;
  }
  const reportProjectSelect = document.querySelector("#reportProjectSelect");
  if (reportProjectSelect) {
    const nextProjectId = chooseEffectiveProjectId({
      defaultProjectId: reportProjectSelect.value || memberProfile?.projectId,
      allowedProjectIds: projects.map((project) => project.id),
    });
    reportProjectSelect.value = nextProjectId;
    if (memberProfile && nextProjectId) memberProfile.projectId = nextProjectId;
  }
  pruneProjectScopedState();
}

async function loadBootstrapData() {
  const payload = await apiRequest("/api/bootstrap");
  applyBootstrapPayload(payload);
}

async function saveRoleBinding(userId, role, defaultProjectId) {
  const payload = await apiRequest(`/api/auth/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify({
      role,
      defaultProjectId: defaultProjectId || null,
    }),
  });
  authState.users = authState.users.map((item) => (item.id === userId ? payload.user : item));
  if (memberProfile?.id === userId) {
    memberProfile = normalizeAuthenticatedUser(payload.user);
  }
}

async function saveProjectChatBinding(projectId, chatId) {
  return apiRequest(`/api/projects/${projectId}/chat`, {
    method: "PUT",
    body: JSON.stringify({ chatId }),
  });
}

async function createProjectRecord(draft) {
  return apiRequest("/api/projects/create", {
    method: "POST",
    body: JSON.stringify(draft),
  });
}

async function deleteProjectRecord(projectId) {
  return apiRequest(`/api/projects/${projectId}`, {
    method: "DELETE",
  });
}

async function saveProjectBrief(project, brief) {
  return apiRequest(`/api/projects/${project.id}/brief`, {
    method: "PUT",
    body: JSON.stringify(buildProjectBriefUpdatePayload(brief)),
  });
}

async function syncProjectChatMembers(projectId, chatId) {
  return apiRequest(`/api/projects/${projectId}/chat/sync`, {
    method: "POST",
    body: JSON.stringify({ chatId }),
  });
}

async function saveProjectMetrics(project, metricSource = getProjectMetricItems(project)) {
  const metrics = metricSource.map((metric) => ({
    id: metric.id,
    name: metric.name,
    currentValue: metric.current,
    targetValue: metric.target,
    observation: metric.observation,
    observable: metric.observable,
    chartType: metric.chartType,
    history: Array.isArray(metric.history) ? metric.history.slice(-8) : [],
  }));
  return apiRequest(`/api/projects/${project.id}/metrics`, {
    method: "PUT",
    body: JSON.stringify({ metrics }),
  });
}

async function saveProjectMilestones(project, milestoneSource = getReportMilestones(project)) {
  const milestones = milestoneSource.map((milestone) => ({
    id: milestone.id,
    title: milestone.title,
    raw: milestone.raw || milestone.title,
    source: milestone.source || "项目维护",
    dateKey: milestone.dateInfo?.key || "",
    status: milestone.status,
    changeNote: milestone.changeNote || "",
  }));
  return apiRequest(`/api/projects/${project.id}/milestones`, {
    method: "PUT",
    body: JSON.stringify({ milestones }),
  });
}

async function syncMyFeishuChats() {
  return apiRequest("/api/auth/feishu/my-chats/sync", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

async function loadFeishuChats() {
  const payload = await apiRequest("/api/auth/feishu/chats");
  authState.chats = payload.chats || [];
}

async function loadWeeklyReports() {
  if (!memberProfile) {
    submissions = [];
    return;
  }
  const payload = await apiRequest("/api/reports");
  submissions = Array.isArray(payload.reports) ? payload.reports : [];
}

async function loadGovernanceTasks() {
  if (!memberProfile?.isAdmin) {
    governanceTasks = [];
    return;
  }
  const payload = await apiRequest("/api/governance");
  governanceTasks = Array.isArray(payload) ? payload : [];
}

function upsertGovernanceTask(task) {
  governanceTasks = [
    task,
    ...governanceTasks.filter((item) => item.id !== task.id && buildGovernanceItemKey(item) !== buildGovernanceItemKey(task)),
  ];
}

async function saveGovernanceResolution(itemKey, patch) {
  const item = getGovernanceItems().find((candidate) => candidate.itemKey === itemKey);
  if (!item) return null;
  const existingTask = governanceTasks.find((task) => buildGovernanceItemKey(task) === itemKey);
  const currentResolution = getGovernanceResolution(item);
  const payload = {
    projectId: item.project.id,
    taskType: item.type,
    title: item.title,
    detail: item.detail,
    level: String(item.level || "medium").toUpperCase(),
    status: normalizeGovernanceStatus(patch.status || currentResolution.status),
    ownerName: patch.owner !== undefined ? patch.owner : currentResolution.owner,
  };
  const task = existingTask
    ? await apiRequest(`/api/governance/${existingTask.id}`, {
        method: "PUT",
        body: JSON.stringify({
          status: payload.status,
          ownerName: payload.ownerName,
        }),
      })
    : await apiRequest("/api/governance", {
        method: "POST",
        body: JSON.stringify(payload),
      });
  upsertGovernanceTask(task);
  return task;
}

async function saveWeeklyReport(report) {
  const payload = await apiRequest("/api/reports", {
    method: "POST",
    body: JSON.stringify({
      projectId: report.projectId,
      milestoneId: report.milestoneId || null,
      weekNumber: report.week,
      progress: report.progress,
      riskSummary: report.risk || null,
      milestoneTitle: report.milestoneTitle || null,
      milestoneDate: report.milestoneDate || null,
      milestoneState: report.milestoneStatus || null,
    }),
  });
  return payload;
}

async function deleteWeeklyReport(reportId) {
  const encodedId = encodeURIComponent(reportId);
  try {
    return await apiRequest(`/api/reports/${encodedId}`, {
      method: "DELETE",
    });
  } catch (error) {
    if (error.status !== 404) throw error;
    return apiRequest(`/api/reports/${encodedId}/delete`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }
}

function getFeishuChatById(chatId) {
  if (!chatId) return null;
  return authState.chats.find((chat) => chat.chatId === chatId) || null;
}

function formatProjectMemberSyncMessage(payload, prefix = "已同步") {
  const count = payload?.members?.length || 0;
  if (payload?.memberSource === "stored" && payload?.refreshed === false) {
    return `飞书未返回新的成员数据，已保留 ${count} 位缓存成员。`;
  }
  return `${prefix} ${count} 位群成员。`;
}

function applyProjectReportState(projectState) {
  if (!projectState?.projectId) return;
  const project = projects.find((item) => item.id === projectState.projectId);
  if (!project) return;
  if (Array.isArray(projectState.metrics)) {
    const maintenance = getProjectMaintenance(project.id);
    maintenance.metrics = projectState.metrics.map((metric, index) => {
      const detail = splitMetricObservation(metric.observation, metric.observable);
      return {
        id: metric.id || uid(`${project.id}-metric`),
        name: String(metric.name || `指标 ${index + 1}`).trim(),
        current: String(metric.current || "").trim(),
        target: String(metric.target || "").trim(),
        observation: detail.observation,
        observable: detail.observable,
        chartType: String(metric.chartType || "").trim(),
        history: Array.isArray(metric.history) ? metric.history.slice(-8) : [],
      };
    });
    maintenance.metricsSourceVersion = PROJECT_METRIC_SOURCE_VERSION;
  }
  if (Array.isArray(projectState.milestones)) {
    project.milestones = projectState.milestones.map((milestone, index) => normalizeMilestone(project, milestone, index));
    getProjectMaintenance(project.id).milestones = project.milestones.map(serializeMilestone);
  }
  if (Array.isArray(projectState.risks)) {
    const risks = projectState.risks.map((risk, index) => normalizeRisk(project, risk, index));
    getProjectMaintenance(project.id).risks = risks;
    project.risks = risks;
  }
  refreshProjectDerived(project);
  persistProjectMaintenance();
}

function getReportableProjects() {
  return getReportableProjectsForUser(projects, memberProfile);
}

function splitLines(text) {
  return String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && line !== "NaN" && line !== "暂无");
}

function formatDateKey(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateFromText(text) {
  const compact = String(text || "").replace(/\s+/g, "");
  const full = compact.match(/(20\d{2})[年/.-](\d{1,2})[月/.-](\d{1,2})日?/);
  if (full) {
    const [, year, month, day] = full.map(Number);
    return makeDateInfo(year, month, day);
  }

  const monthDay = compact.match(/(\d{1,2})[月/.](\d{1,2})日?/);
  if (monthDay) {
    const [, month, day] = monthDay.map(Number);
    return makeDateInfo(DEFAULT_YEAR, month, day);
  }

  const shortMay = compact.match(/^5(\d{2})(?=完成|上线|发布|前|$)/);
  if (shortMay) {
    return makeDateInfo(DEFAULT_YEAR, 5, Number(shortMay[1]));
  }

  return null;
}

function makeDateInfo(year, month, day) {
  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return {
    year,
    month,
    day,
    key: formatDateKey(year, month, day),
    label: `${month}月${day}日`,
    date,
  };
}

function cleanMilestoneTitle(line) {
  return String(line || "")
    .replace(/^里程碑\s*\d+\s*[：:]/, "")
    .replace(/^(20\d{2})[年/.-]\d{1,2}[月/.-]\d{1,2}日?[，,:：\s-]*/, "")
    .replace(/^\d{1,2}[月/.]\d{1,2}日?[，,:：\s-]*/, "")
    .replace(/^5\d{2}(完成|上线|发布)?[：:，,\s-]*/, "")
    .trim();
}

function inferMilestoneStatus(line, dateInfo) {
  const text = String(line || "");
  if (/调整|变更|延期|推迟/.test(text)) return "changed";
  const looksCompleted = /已完成|已上线|已发布|已确认|评审完成|交付完成|封版上线/.test(text);
  if (looksCompleted && (!dateInfo || dateInfo.date <= TODAY)) return "completed";
  if (/开发|测试|试点|持续|进行|联调|排期中/.test(text) && dateInfo && dateInfo.date <= TODAY) return "in-progress";
  if (!dateInfo) return "planned";

  const diffDays = (dateInfo.date - TODAY) / 86400000;
  if (diffDays < 0) return "overdue";
  if (diffDays <= 7) return "upcoming";
  return "planned";
}

function extractMilestones(row) {
  const chunks = [
    ...splitLines(row.mayKeyNodes).map((line) => ({ line, source: "5月关键节点" })),
    ...splitLines(row.futureMilestones).map((line) => ({ line, source: "未来里程碑" })),
  ];

  return chunks
    .map((item, index) => {
      const dateInfo = parseDateFromText(item.line);
      const title = cleanMilestoneTitle(item.line) || item.line;
      return {
        id: `${row.id}-m${index + 1}`,
        projectId: row.id,
        projectName: row.name,
        projectShortName: cleanProjectName(row.name),
        title,
        raw: item.line,
        source: item.source,
        dateInfo,
        status: inferMilestoneStatus(item.line, dateInfo),
      };
    })
    .filter((milestone) => milestone.title && milestone.title !== "暂无");
}

function extractStage(text) {
  const match = String(text || "").match(/当前阶段[：:]\s*([^\n。；;]+)/);
  if (match) return match[1].trim();
  if (/已正式上线|正式上线/.test(text)) return "已上线";
  if (/开发中|开发/.test(text)) return "开发中";
  if (/试点/.test(text)) return "试点中";
  if (/方案|设计|评审/.test(text)) return "方案设计";
  return "推进中";
}

function extractPercentValues(text) {
  const values = [];
  const regex = /(\d+(?:\.\d+)?)%/g;
  let match = regex.exec(text);
  while (match) {
    values.push(Number(match[1]));
    match = regex.exec(text);
  }
  return values;
}

function deriveProgress(row, milestones) {
  const percents = extractPercentValues(`${row.metricsText}\n${row.overallText}`);
  if (percents.length) {
    const average = percents.reduce((total, value) => total + Math.min(value, 100), 0) / percents.length;
    return Math.round(average);
  }

  if (!milestones.length) return 20;
  const completed = milestones.filter((milestone) => milestone.status === "completed").length;
  const doing = milestones.filter((milestone) => milestone.status === "in-progress").length;
  return Math.min(95, Math.max(18, Math.round(((completed + doing * 0.5) / milestones.length) * 100)));
}

function deriveRiskItems(row, milestones) {
  const allText = `${row.mayKeyNodes}\n${row.futureMilestones}\n${row.metricsText}\n${row.overallText}`;
  const risks = [];

  if (row.established !== "是") {
    risks.push({
      level: "high",
      title: "重点项目未正式立项",
      detail: "表中“是否立项”为否，需要确认治理口径、资源归属与追踪方式。",
    });
  }

  if (/不足.*资源|资源不足|缺.*人|找人/.test(allText)) {
    risks.push({
      level: "high",
      title: "资源投入存在缺口",
      detail: compactText(allText.match(/[^。；;\n]*(不足.*资源|资源不足|缺.*人|找人)[^。；;\n]*/)?.[0] || allText, 96),
    });
  }

  const delayed = milestones.filter((milestone) => milestone.status === "overdue");
  if (delayed.length) {
    risks.push({
      level: "medium",
      title: "存在已过计划日节点",
      detail: `${delayed.length} 个节点已过计划日，表中尚未识别为完成：${delayed
        .slice(0, 2)
        .map((item) => item.title)
        .join("；")}`,
    });
  }

  if (/待补充|暂无|待排期|依赖/.test(allText)) {
    risks.push({
      level: "medium",
      title: "关键信息待补充",
      detail: compactText(allText.match(/[^。；;\n]*(待补充|暂无|待排期|依赖)[^。；;\n]*/)?.[0] || allText, 96),
    });
  }

  return risks;
}

function deriveStatus(row, milestones, risks) {
  const openRisks = risks.filter((risk) => risk.status !== "closed");
  if (openRisks.some((risk) => risk.level === "high")) return "risk";
  if (milestones.some((milestone) => milestone.status === "overdue")) return "risk";
  if (openRisks.length || row.established !== "是") return "watch";
  return "normal";
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function parseMetricNumber(value) {
  const match = String(value || "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function extractMetricHighlights(text) {
  const source = String(text || "");
  const highlights = [];
  const percentRegex = /([^，。；;\n]{0,18}?)(\d+(?:\.\d+)?)%/g;
  let match = percentRegex.exec(source);
  while (match && highlights.length < 4) {
    highlights.push({
      label: match[1].replace(/[，。；;\n]/g, "").trim() || "指标",
      value: `${match[2]}%`,
    });
    match = percentRegex.exec(source);
  }

  const amountRegex = /(\d+(?:\.\d+)?\s*(?:万|w|家|人|小时|元|天|条|分钟))/gi;
  match = amountRegex.exec(source);
  while (match && highlights.length < 4) {
    highlights.push({ label: "量化值", value: match[1].replace(/\s+/g, "") });
    match = amountRegex.exec(source);
  }

  return highlights;
}

function getStandardMetricRows(projectName) {
  const projectKey = canonicalProjectName(projectName);
  return sourceMetricRows.filter((metric) => canonicalProjectName(metric.projectName) === projectKey);
}

function toMetricHighlight(metric) {
  return {
    label: metric.name || "指标",
    value: metric.current && metric.current !== "-" ? metric.current : metric.target || "待补充",
  };
}

function parseTeam(teamText) {
  const source = String(teamText || "");
  return teamRoles.map((role) => {
    const value = source.match(role.pattern)?.[1]?.trim() || "未填写";
    return {
      ...role,
      value: value || "未填写",
    };
  });
}

function teamSummary(team) {
  const visible = team
    .filter((item) => item.value !== "未填写")
    .slice(0, 3)
    .map((item) => `${item.label}${item.value}`);
  return visible.length ? visible.join(" / ") : "项目组未填写";
}

function iconSvg(name) {
  const icons = {
    product:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"></path><path d="M12 8v8M8 10l4 2 4-2"></path></svg>',
    test:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7"></path><path d="M4 4h16v16H4z"></path></svg>',
    dev:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8l-4 4 4 4"></path><path d="M16 8l4 4-4 4"></path><path d="M14 4l-4 16"></path></svg>',
    algo:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"></path><path d="M7.7 7l8.6 0M7.2 8.5l3.6 7M16.8 8.5l-3.6 7"></path></svg>',
  };
  return icons[name] || icons.product;
}

function buildProjects(rows) {
  return rows
    .filter((row) => row.isKeyProject === "是")
    .map((row, index) => {
      const milestones = extractMilestones(row);
      const risks = deriveRiskItems(row, milestones);
      const status = deriveStatus(row, milestones, risks);
      const team = parseTeam(row.teamText);
      const standardMetrics = getStandardMetricRows(row.name);
      return {
        ...row,
        shortName: cleanProjectName(row.name),
        stage: extractStage(row.overallText),
        milestones,
        risks,
        status,
        progress: deriveProgress(row, milestones),
        metricHighlights: standardMetrics.length ? standardMetrics.map(toMetricHighlight).slice(0, 4) : extractMetricHighlights(row.metricsText),
        standardMetrics,
        team,
        owner: row.owner || "未填写",
        color: PROJECT_COLORS[index % PROJECT_COLORS.length],
      };
    });
}

let projects = buildProjects(sourceRows);
syncProjectBriefOverrides();
state.selectedId = projects[0]?.id || null;

function serializeMilestone(milestone) {
  return {
    id: milestone.id,
    projectId: milestone.projectId,
    projectName: milestone.projectName,
    projectShortName: milestone.projectShortName,
    title: milestone.title,
    raw: milestone.raw || milestone.title,
    source: milestone.source || "项目维护",
    dateKey: milestone.dateInfo?.key || "",
    status: milestone.status || "planned",
    changeNote: milestone.changeNote || "",
  };
}

function normalizeMilestone(project, milestone, index = 0) {
  const milestoneDateKey = String(milestone.dateKey || milestone.dateInfo?.key || "").trim();
  const rawParts = milestoneDateKey ? milestoneDateKey.split("-").map(Number) : [];
  const dateInfo = rawParts.length === 3 && rawParts.every((n) => !Number.isNaN(n))
    ? parseDateFromText(milestoneDateKey) || makeDateInfo(...rawParts)
    : null;
  const title = String(milestone.title || "").trim() || "未命名里程碑";
  return {
    id: milestone.id || uid(`${project.id}-m`),
    projectId: project.id,
    projectName: project.name,
    projectShortName: project.shortName,
    title,
    raw: milestone.raw || title,
    source: milestone.source || "项目维护",
    dateInfo,
    status: migrateMilestoneStatus(milestone.status || inferMilestoneStatus(title, dateInfo)),
    changeNote: String(milestone.changeNote || "").trim(),
  };
}

function getDefaultMetricItems(project) {
  if (Array.isArray(project.standardMetrics) && project.standardMetrics.length) {
    return project.standardMetrics.map((metric, index) => {
      const detail = splitMetricObservation(metric.observation, metric.observable);
      return {
        id: `${project.id}-metric-${index + 1}`,
        name: String(metric.name || `指标 ${index + 1}`).trim(),
        current: String(metric.current || "").trim(),
        target: String(metric.target || "").trim(),
        observation: detail.observation,
        observable: detail.observable,
        chartType: parseMetricNumber(metric.target) !== null ? "donut" : "value",
        history:
          metric.current && metric.current !== "-"
            ? [{ date: formatDateKey(TODAY.getFullYear(), TODAY.getMonth() + 1, TODAY.getDate()), value: metric.current }]
            : [],
      };
    });
  }

  if (sourceMetricRows.length) return [];

  if (project.metricHighlights.length) {
    return project.metricHighlights.map((item, index) => ({
      id: `${project.id}-metric-${index + 1}`,
      name: item.label || `指标 ${index + 1}`,
      current: item.value || "",
      target: /%$/.test(item.value || "") ? "100%" : "",
      observation: index === 0 ? compactText(project.metricsText, 90) : "",
      observable: "",
      history: item.value ? [{ date: formatDateKey(TODAY.getFullYear(), TODAY.getMonth() + 1, TODAY.getDate()), value: item.value }] : [],
    }));
  }

  return [
    {
      id: `${project.id}-metric-1`,
      name: "项目指标",
      current: "",
      target: "",
      observation: compactText(project.metricsText, 90),
      observable: "",
      history: [],
    },
  ];
}

function getProjectMaintenance(projectId) {
  if (!projectMaintenance[projectId]) projectMaintenance[projectId] = {};
  return projectMaintenance[projectId];
}

function persistProjectMaintenance() {
  safeLocalStorageSet("project-dashboard-maintenance", projectMaintenance);
}

function getProjectMetricItems(project) {
  const maintenance = getProjectMaintenance(project.id);
  const saved = maintenance.metrics;
  if (
    shouldUseSavedMetrics({
      savedMetrics: saved,
      sourceMetricRows,
      metricsSourceVersion: maintenance.metricsSourceVersion,
    })
  ) {
    return saved;
  }
  return getDefaultMetricItems(project);
}

function getProjectBriefData(project) {
  return {
    owner: String(project.owner || "未填写").trim(),
    businessLine: String(project.businessLine || "未填业务线").trim(),
    overview: String(project.overallText || "").trim(),
    teamSummary: String(project.teamText || "").trim(),
  };
}

function applyProjectBrief(project, brief) {
  applyProjectBriefSnapshot(project, brief);
  project.team = parseTeam(project.teamText);
  delete getProjectMaintenance(project.id).brief;
  persistProjectMaintenance();
}

function ensureBriefDraft(project) {
  if (!draftStore.briefs[project.id]) draftStore.briefs[project.id] = { ...getProjectBriefData(project) };
  return draftStore.briefs[project.id];
}

function resetBriefDraft(projectId) {
  delete draftStore.briefs[projectId];
}

function commitBriefDraft(project) {
  applyProjectBrief(project, ensureBriefDraft(project));
  resetBriefDraft(project.id);
}

function setProjectMetricItems(project, metrics) {
  const maintenance = getProjectMaintenance(project.id);
  maintenance.metrics = metrics.map((metric, index) => {
    const detail = splitMetricObservation(metric.observation, metric.observable);
    return {
      id: metric.id || uid(`${project.id}-metric`),
      name: String(metric.name || `指标 ${index + 1}`).trim(),
      current: String(metric.current || "").trim(),
      target: String(metric.target || "").trim(),
      observation: detail.observation,
      observable: detail.observable,
      chartType: String(metric.chartType || "").trim(),
      history: Array.isArray(metric.history) ? metric.history.slice(-8) : [],
    };
  });
  maintenance.metricsSourceVersion = PROJECT_METRIC_SOURCE_VERSION;
  persistProjectMaintenance();
}

function cloneMetricItems(metrics) {
  return metrics.map((metric) => ({
    ...metric,
    history: Array.isArray(metric.history) ? metric.history.map((item) => ({ ...item })) : [],
  }));
}

function ensureMetricDraft(project) {
  if (!draftStore.metrics[project.id]) draftStore.metrics[project.id] = cloneMetricItems(getProjectMetricItems(project));
  return draftStore.metrics[project.id];
}

function resetMetricDraft(projectId) {
  delete draftStore.metrics[projectId];
}

function commitMetricDraft(project) {
  setProjectMetricItems(project, ensureMetricDraft(project));
  resetMetricDraft(project.id);
}

function normalizeRisk(project, risk, index = 0) {
  return {
    id: risk.id || uid(`${project.id}-risk`),
    level: risk.level || "medium",
    title: String(risk.title || `风险 ${index + 1}`).trim(),
    detail: String(risk.detail || "").trim(),
    owner: String(risk.owner || "").trim(),
    dueDate: String(risk.dueDate || "").trim(),
    status: risk.status || "open",
    source: risk.source || "项目维护",
  };
}

function getDefaultRiskItems(project) {
  return deriveRiskItems(project, project.milestones).map((risk, index) =>
    normalizeRisk(project, {
      ...risk,
      id: `${project.id}-risk-${index + 1}`,
      owner: project.owner === "未填写" ? "" : project.owner,
      dueDate: "",
      status: "open",
      source: "系统识别",
    }, index)
  );
}

function getProjectRiskItems(project) {
  const saved = getProjectMaintenance(project.id).risks;
  if (Array.isArray(saved)) return saved.map((risk, index) => normalizeRisk(project, risk, index));
  return getDefaultRiskItems(project);
}

function syncProjectBriefOverrides() {
  projects.forEach((project) => {
    const saved = getProjectMaintenance(project.id).brief;
    if (!saved) return;
    delete getProjectMaintenance(project.id).brief;
  });
  persistProjectMaintenance();
}

function setProjectRiskItems(project, risks) {
  const normalized = risks.map((risk, index) => normalizeRisk(project, risk, index));
  getProjectMaintenance(project.id).risks = normalized;
  project.risks = normalized;
  project.status = deriveStatus(project, project.milestones, normalized);
  persistProjectMaintenance();
}

function getMetricProgress(metric) {
  const status = getMetricTargetStatus(metric);
  if (status.progress !== null) return status.progress;
  const current = parseMetricNumber(metric.current);
  if (current !== null && /%/.test(metric.current || "")) return clampPercent(current);
  return null;
}

function metricHasTarget(metric) {
  return getMetricTargetStatus(metric).hasTarget;
}

function refreshProjectDerived(project) {
  project.risks = getProjectRiskItems(project);
  project.status = deriveStatus(project, project.milestones, project.risks);
  project.progress = deriveProgress(project, project.milestones);
}

function applyProjectMaintenance() {
  projects.forEach((project) => {
    const savedMilestones = getProjectMaintenance(project.id).milestones;
    if (Array.isArray(savedMilestones) && savedMilestones.length) {
      project.milestones = savedMilestones.map((milestone, index) => normalizeMilestone(project, milestone, index));
    }
    refreshProjectDerived(project);
  });
}

function setProjectMilestones(project, milestones) {
  project.milestones = milestones.map((milestone, index) => normalizeMilestone(project, milestone, index));
  getProjectMaintenance(project.id).milestones = project.milestones.map(serializeMilestone);
  refreshProjectDerived(project);
  persistProjectMaintenance();
}

function cloneMilestoneDraft(project) {
  return getReportMilestones(project).map((milestone) => ({
    ...milestone,
    dateInfo: milestone.dateInfo ? { ...milestone.dateInfo, date: new Date(milestone.dateInfo.date) } : null,
  }));
}

function updateMetricDraftFromField(metricField) {
  const project = getReportProject();
  draftStore.metrics[project.id] = updateMetricDraftField(ensureMetricDraft(project), {
    metricId: metricField.dataset.metricId,
    field: metricField.dataset.metricField,
    value: metricField.value,
  });
}

function updateMilestoneDraftFromField(milestoneField) {
  const project = getReportProject();
  const updated = updateMilestoneDraftField(ensureMilestoneDraft(project), {
    milestoneId: milestoneField.dataset.milestoneId,
    field: milestoneField.dataset.milestoneField,
    value: milestoneField.value,
  }).map((milestone, index) => normalizeMilestone(project, milestone, index));
  draftStore.milestones[project.id] = updated;
}

function updateFocusedMilestoneFromForm() {
  const form = document.querySelector("#memberReportForm");
  const project = getReportProject();
  const milestone = getReportMilestone(project);
  if (!form || !project || !milestone) return;
  const patch = buildFocusedMilestonePatch(
    {
      title: form.elements.milestoneTitle.value,
      dateKey: form.elements.milestoneDate.value,
      status: form.elements.milestoneStatus.value,
    },
    serializeMilestone(milestone)
  );
  const updated = getReportMilestones(project).map((item, index) =>
    item.id === milestone.id ? normalizeMilestone(project, { ...serializeMilestone(item), ...patch }, index) : item
  );
  if (hasActiveMilestoneDraft(project)) {
    draftStore.milestones[project.id] = updated;
  } else {
    project.milestones = updated;
    refreshProjectDerived(project);
  }
}

function refreshMilestoneMaintenanceViews({ renderRail = true, syncFields = true } = {}) {
  if (renderRail) renderReportMilestoneRail();
  if (syncFields) syncReportMilestoneFields();
  renderWeekTimeline();
  renderReportProjectBrief();
  renderCalendar();
  renderDetail();
  renderGovernance();
  renderReportStatusPanel();
  renderSummary();
  renderDataHealth();
}

function preserveScrollPosition(callback) {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  callback();
  requestAnimationFrame(() => window.scrollTo(scrollX, scrollY));
}

function ensureMilestoneDraft(project) {
  if (!draftStore.milestones[project.id]) draftStore.milestones[project.id] = cloneMilestoneDraft(project);
  return draftStore.milestones[project.id];
}

function resetMilestoneDraft(projectId) {
  delete draftStore.milestones[projectId];
}

function commitMilestoneDraft(project) {
  setProjectMilestones(project, ensureMilestoneDraft(project));
  resetMilestoneDraft(project.id);
}

function resetAllDrafts() {
  draftStore.briefs = {};
  draftStore.metrics = {};
  draftStore.milestones = {};
}

function resetReportEditorState() {
  state.selectedReportMilestoneId = null;
  state.metricEditMode = false;
  state.milestoneManageMode = false;
  state.briefEditMode = false;
  state.milestoneEditMode = false;
  state.saveNotice = "";
}

function getGovernanceStore() {
  if (!projectMaintenance.__governance) projectMaintenance.__governance = {};
  return projectMaintenance.__governance;
}

function getGovernanceItemKey(item) {
  return buildGovernanceItemKey(item);
}

function getGovernanceResolution(item) {
  const itemKey = getGovernanceItemKey(item);
  const task = governanceTasks.find((candidate) => buildGovernanceItemKey(candidate) === itemKey);
  if (task) return toClientGovernanceResolution(task);
  const saved = getGovernanceStore()[itemKey] || {};
  return {
    status: saved.status || "todo",
    owner: String(saved.owner || "").trim(),
  };
}

function setGovernanceResolution(itemKey, patch) {
  const store = getGovernanceStore();
  store[itemKey] = {
    status: patch.status || store[itemKey]?.status || "todo",
    owner: String(patch.owner || store[itemKey]?.owner || "").trim(),
  };
  persistProjectMaintenance();
}

applyProjectMaintenance();

function getFilteredProjects() {
  let result = projects;
  if (state.businessLine !== "all") {
    result = result.filter((project) => (project.businessLine || "未填业务线") === state.businessLine);
  }
  if (state.filter === "all") return result;
  return result.filter((project) => project.status === state.filter);
}

function getNextMilestone(project) {
  return getNearestMilestone(project?.milestones || [], TODAY);
}

function getCalendarLabel() {
  return `${state.calendarYear}年${state.calendarMonth}月`;
}

function shiftCalendarMonth(offset) {
  const next = new Date(state.calendarYear, state.calendarMonth - 1 + offset, 1);
  state.calendarYear = next.getFullYear();
  state.calendarMonth = next.getMonth() + 1;
}

function getMetricCoverage(projectList) {
  if (!projectList.length) return 0;
  const count = projectList.filter((project) => {
    const text = project.metricsText || "";
    return text && !/^\s*(暂无|待补充)\s*$/.test(text);
  }).length;
  return Math.round((count / projectList.length) * 100);
}

function renderToday() {
  document.querySelector("#todayLabel").textContent = TODAY.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function renderViewSwitch() {
  state.currentView = getAllowedView(state.currentView);
  document.body.classList.toggle("auth-page", state.currentView === "register");
  document.querySelectorAll("[data-view]").forEach((button) => {
    const view = button.dataset.view;
    const anonymousBlocked = !memberProfile && view !== "register";
    const hiddenForMember = Boolean(
      memberProfile && view !== "calendar" && resolveAllowedProjectView(view, memberProfile) !== view
    );
    button.classList.toggle("is-hidden", Boolean(anonymousBlocked || hiddenForMember));
  });
  document.querySelectorAll(".view-button").forEach((button) => {
    const isActive = button.dataset.view === state.currentView;
    button.classList.toggle("is-active", isActive);
    if (isActive) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.querySelectorAll(".app-view").forEach((view) => {
    view.classList.toggle("is-active", view.id === `${state.currentView}View`);
  });
}

function renderBusinessLineFilter() {
  const select = document.querySelector("#businessLineFilter");
  const businessLines = [...new Set(projects.map((project) => project.businessLine || "未填业务线"))].sort();
  select.innerHTML = [
    '<option value="all">全部业务线</option>',
    ...businessLines.map((line) => `<option value="${escapeHtml(line)}">${escapeHtml(line)}</option>`),
  ].join("");
  select.value = state.businessLine;
}

function renderSummary() {
  const filtered = getFilteredProjects();
  const allMilestones = filtered.flatMap((project) => project.milestones);
  const monthMilestones = allMilestones.filter(
    (milestone) => milestone.dateInfo?.year === state.calendarYear && milestone.dateInfo?.month === state.calendarMonth
  );
  const riskProjects = filtered.filter((project) => project.status === "risk").length;
  const watchProjects = filtered.filter((project) => project.status !== "normal").length;
  const delayed = allMilestones.filter((milestone) => milestone.status === "overdue").length;
  const missingWeeklyUpdate = filtered.filter((project) => !getCurrentWeekSubmission(project.id)).length;
  const metricGaps = filtered.filter((project) => {
    const metrics = getProjectMetricItems(project);
    return metrics.every((metric) => !metric.current || /待补充|暂无/.test(metric.current));
  }).length;

  const cards = [
    {
      label: "重点项目数",
      value: filtered.length,
      helper: `${new Set(filtered.map((project) => project.businessLine)).size} 条业务线 · ${filtered.length} 个项目纳入看板`,
      tone: "blue",
      icon: "◇",
    },
    {
      label: `${state.calendarMonth}月里程碑`,
      value: monthMilestones.length,
      helper: `${monthMilestones.filter((m) => m.status === "completed").length} 个已完成 · ${delayed} 个待确认`,
      tone: "amber",
      icon: "◷",
    },
    {
      label: "需关注项目",
      value: watchProjects,
      helper: `${riskProjects} 个项目处于风险 · ${filtered.filter((p) => p.status === "watch").length} 个需关注`,
      tone: "rose",
      icon: "!",
    },
    {
      label: "本周未更新",
      value: missingWeeklyUpdate,
      helper: `${filtered.length - missingWeeklyUpdate} 个项目已提交本周进展 · PMO需催办 ${missingWeeklyUpdate} 个`,
      tone: "green",
      icon: "✓",
    },
    {
      label: "指标待补",
      value: metricGaps,
      helper: `${getMetricCoverage(filtered)}% 项目已有指标说明 · ${filtered.length - metricGaps} 个可结构化`,
      tone: "violet",
      icon: "%",
    },
  ];

  document.querySelector("#summaryGrid").innerHTML = cards
    .map(
      (card) => `
        <article class="summary-card tone-${card.tone}">
          <span class="summary-icon">${card.icon}</span>
          <span class="summary-label">${card.label}</span>
          <strong>${card.value}</strong>
          <small>${card.helper}</small>
        </article>
      `
    )
    .join("");
}

function renderDataHealth() {
  const container = document.querySelector("#dataHealthStrip");
  if (!container) return;
  const model = buildDataHealthModel({
    source: state.dataSource,
    projects: getFilteredProjects(),
    reports: submissions,
    currentWeek: CURRENT_REPORT_WEEK,
    getMetricItems: getProjectMetricItems,
  });
  container.innerHTML = `
    <div class="data-health-score tone-${model.overallScore >= 80 ? "green" : model.overallScore >= 55 ? "amber" : "rose"}">
      <span>数据联通</span>
      <strong>${model.overallScore}</strong>
      <small>${escapeHtml(model.sourceLabel)}</small>
    </div>
    <div class="data-health-cards">
      ${model.cards
        .map(
          (card) => `
            <article class="data-health-card tone-${card.tone}">
              <span>${escapeHtml(card.label)}</span>
              <strong>${escapeHtml(card.value)}</strong>
              <small>${escapeHtml(card.detail)}</small>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function getDashboardAttentionItems() {
  const items = [];
  const levelRank = { high: 0, medium: 1, low: 2 };

  getFilteredProjects().forEach((project) => {
    const riskMilestone = project.milestones
      .filter((milestone) => milestone.status === "overdue")
      .sort((a, b) => (a.dateInfo?.date?.getTime() || 0) - (b.dateInfo?.date?.getTime() || 0))[0];
    if (riskMilestone) {
      items.push({
        level: "high",
        type: "逾期节点",
        project,
        title: riskMilestone.title,
        detail: riskMilestone.dateInfo?.label || "未标日期",
      });
    }

    const openRisk = project.risks
      .filter((risk) => risk.status !== "closed")
      .sort((a, b) => levelRank[a.level] - levelRank[b.level])[0];
    if (openRisk) {
      items.push({
        level: openRisk.level === "high" ? "high" : "medium",
        type: "风险",
        project,
        title: openRisk.title,
        detail: openRisk.detail || "需要确认风险影响与闭环计划",
      });
    }

    if (!getCurrentWeekSubmission(project.id)) {
      const latest = getLatestProjectSubmission(project.id);
      items.push({
        level: latest ? "medium" : "high",
        type: "未更新",
        project,
        title: "本周进展待补充",
        detail: latest ? `最近一次第${latest.week || CURRENT_REPORT_WEEK}周更新` : "暂无成员填报记录",
      });
    }

    const metrics = getProjectMetricItems(project);
    const metricNeedsWork = !metrics.length || metrics.some((metric) => !metric.name || !metric.current || (!metric.target && !metric.observation));
    if (metricNeedsWork) {
      items.push({
        level: "low",
        type: "指标",
        project,
        title: "指标口径待完善",
        detail: "补齐当前值、目标值或观测口径后可进入右侧详情图表",
      });
    }
  });

  return items
    .sort((a, b) => levelRank[a.level] - levelRank[b.level])
    .slice(0, 6);
}

function renderAttention() {
  const container = document.querySelector("#attentionList");
  if (!container) return;
  const items = getDashboardAttentionItems();

  if (!items.length) {
    container.innerHTML = '<div class="attention-empty">当前没有需要优先关注的事项</div>';
    return;
  }

  container.innerHTML = items
    .map(
      (item) => `
        <button class="attention-item ${item.level}" type="button" data-project="${item.project.id}">
          <span>${escapeHtml(item.type)}</span>
          <strong>${escapeHtml(item.project.shortName)}</strong>
          <small>${escapeHtml(compactText(item.title, 34))}</small>
          <em>${escapeHtml(compactText(item.detail, 42))}</em>
        </button>
      `
    )
    .join("");
}

function renderFilters() {
  document.querySelector("#filterTabs").innerHTML = filters
    .map(
      (filter) => `
        <button class="segment-button ${state.filter === filter.key ? "is-active" : ""}" data-filter="${
        filter.key
      }">${filter.label}</button>
      `
    )
    .join("");
}

function renderProjectList() {
  const filtered = getFilteredProjects();
  const list = document.querySelector("#projectList");
  document.querySelector("#projectCountText").textContent = "";

  if (!filtered.some((project) => project.id === state.selectedId) && filtered.length > 0) {
    state.selectedId = filtered[0].id;
  }

  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state">当前筛选下暂无项目</div>';
    renderAttention();
    return;
  }

  list.innerHTML = filtered
    .map((project) => {
      const status = statusMap[project.status];
      const next = getNextMilestone(project);
      const currentWeekSubmission = getCurrentWeekSubmission(project.id);
      const latestSubmission = getLatestProjectSubmission(project.id);
      const updateTip = currentWeekSubmission
        ? `本周已由 ${currentWeekSubmission.memberName} 更新：${compactText(currentWeekSubmission.progress, 90)}`
        : latestSubmission
          ? `本周未更新，最近一次为第${latestSubmission.week || CURRENT_REPORT_WEEK}周：${compactText(latestSubmission.progress, 90)}`
          : "本周未更新，且暂无历史填报记录";
      const projectMetrics = getProjectMetricItems(project);
      const metricTip = projectMetrics.length
        ? projectMetrics.map((item) => `${item.name}${item.current || "待填"}${item.target ? ` / 目标${item.target}` : ""}`).join(" / ")
        : compactText(project.metricsText, 80);
      const riskTip = project.risks[0]?.detail || "当前无显著风险提示";
      const metricReadyCount = projectMetrics.filter((item) => item.current).length;
      const metricLabel = metricReadyCount ? `${metricReadyCount} 项指标` : "待补充";
      const metricSummary = metricReadyCount
        ? projectMetrics.filter((item) => item.current).slice(0, 2).map((item) => `${item.current}`).join(" / ")
        : "暂无量化值";
      const hoverMetric = metricReadyCount
        ? projectMetrics.map((item) => `${item.name}${item.current || "待填"}`).join("，")
        : compactText(project.metricsText, 64);
      const hoverNode = next
        ? `${next.dateInfo?.label || "未标日期"} · ${next.title}`
        : "暂无可识别节点";

      return `
        <article class="project-row ${project.id === state.selectedId ? "is-selected" : ""}" data-project="${
        project.id
      }" role="button" tabindex="0" style="--project-color: ${project.color}">
          <span class="project-name">
            <strong>${escapeHtml(project.shortName)}</strong>
            <span>${escapeHtml(project.businessLine || "未填业务线")} · ${escapeHtml(formatProjectStageLabel(project.stage))}</span>
            <span class="owner-line">负责人 ${escapeHtml(project.owner)}</span>
          </span>
          <span class="project-meta">
            <span class="status-pill ${status.className} has-tip" data-tip="${escapeHtml(
        riskTip
      )}">${status.label}</span>
            <span class="update-pill ${currentWeekSubmission ? "is-done" : "is-missing"} has-tip" data-tip="${escapeHtml(updateTip)}">${
        currentWeekSubmission ? "本周已更" : "待更新"
      }</span>
          </span>
          <span class="project-meta">
            <span>当前关键节点</span>
            <strong>${escapeHtml(next?.title || "暂无节点")}</strong>
            <span>${escapeHtml(next?.dateInfo?.label || "未标日期")}</span>
          </span>
          <span class="project-signal has-tip" data-tip="${escapeHtml(metricTip)}">
            <span>指标状态</span>
            <strong>${escapeHtml(metricLabel)}</strong>
            <span>${escapeHtml(metricSummary)}</span>
          </span>
          <span class="project-actions">
            <span class="tiny-action" role="button" tabindex="0" data-project-maintenance="${project.id}">详情</span>
          </span>
          <span class="project-hover">
            <span><b>节点</b>${escapeHtml(compactText(hoverNode, 92))}</span>
            <span><b>指标</b>${escapeHtml(compactText(hoverMetric, 92))}</span>
            <span><b>风险</b>${escapeHtml(compactText(riskTip, 92))}</span>
            <span><b>更新</b>${escapeHtml(compactText(updateTip, 92))}</span>
          </span>
        </article>
      `;
    })
    .join("");
  renderAttention();
}

function renderCalendar() {
  const filtered = getFilteredProjects();
  if (state.calendarProject !== "all" && !filtered.some((project) => project.id === state.calendarProject)) {
    state.calendarProject = "all";
  }
  const calendarProjects = state.calendarProject === "all"
    ? filtered
    : filtered.filter((project) => project.id === state.calendarProject);
  const reportProject = getReportProject();
  const milestones = calendarProjects
    .flatMap((project) =>
      getMilestoneCalendarSource({
        projectId: project.id,
        reportProjectId: reportProject?.id,
        isManagingMilestones: state.milestoneManageMode,
        projectMilestones: project.milestones,
        draftMilestones: draftStore.milestones[project.id],
      }).map((milestone) => ({
        ...milestone,
        projectColor: project.color,
      }))
    )
    .filter((milestone) => milestone.dateInfo?.year === state.calendarYear && milestone.dateInfo?.month === state.calendarMonth);
  const firstDay = new Date(state.calendarYear, state.calendarMonth - 1, 1);
  const daysInMonth = new Date(state.calendarYear, state.calendarMonth, 0).getDate();
  const mondayBasedOffset = (firstDay.getDay() + 6) % 7;
  const cells = weekLabels.map((label) => `<div class="calendar-head">${label}</div>`);

  document.querySelector("#calendarTitle").textContent = `${getCalendarLabel()}里程碑`;
  document.querySelector("#calendarMonthLabel").textContent = getCalendarLabel();
  document.querySelector("#calendarProjectLegend").innerHTML = [
    `<button class="legend-chip ${state.calendarProject === "all" ? "is-active" : ""}" type="button" data-calendar-project="all">全部项目</button>`,
    ...filtered.map(
      (project) => `
        <button class="legend-chip ${state.calendarProject === project.id ? "is-active" : ""}" type="button" data-calendar-project="${
        project.id
      }" style="--project-color: ${project.color}">
          <span></span>${escapeHtml(project.shortName)}
        </button>
      `
    ),
  ].join("");

  for (let i = 0; i < mondayBasedOffset; i += 1) cells.push('<div class="calendar-day is-muted"></div>');

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dayKey = formatDateKey(state.calendarYear, state.calendarMonth, day);
    const dayEvents = milestones.filter((milestone) => milestone.dateInfo.day === day);
    const dayState = getVisibleCalendarEvents(dayEvents, {
      expanded: Boolean(state.expandedCalendarDays[dayKey]),
      limit: 3,
    });
    const eventMarkup = dayState.visible
      .map(
        (milestone) => `
          <button class="calendar-event has-tip" data-project="${milestone.projectId}" data-milestone="${
          milestone.id
        }" data-tip="${escapeHtml(`${milestone.projectShortName} · ${formatMilestoneStatusLabel(milestone.status)} · ${milestone.raw}${milestone.changeNote ? ` · 变更：${formatMilestoneChangeSummary(milestone.changeNote)}` : ""}`)}" style="--project-color: ${milestone.projectColor}">
            <span class="calendar-event-top">
              <b>${escapeHtml(milestone.projectShortName)}</b>
              ${renderMilestoneStatusTag(milestone)}
            </span>
            <strong>${escapeHtml(compactText(milestone.title, 26))}</strong>
            ${getMilestoneReportBadge(milestone.projectId, milestone.id)}
            ${renderChangeBadge(milestone)}
          </button>
        `
      )
      .join("");
    const moreMarkup = dayState.hiddenCount
      ? `<button class="calendar-more" type="button" data-calendar-day="${dayKey}">还有 ${dayState.hiddenCount} 个</button>`
      : dayState.isExpanded && dayEvents.length > 3
        ? `<button class="calendar-more" type="button" data-calendar-day="${dayKey}">收起</button>`
        : "";

    cells.push(`
      <div class="calendar-day ${dayState.isExpanded ? "is-expanded" : ""}">
        <div class="calendar-date">${day}</div>
        <div class="calendar-day-events">
          ${eventMarkup}
        </div>
        ${moreMarkup}
      </div>
    `);
  }

  document.querySelector("#calendarGrid").innerHTML = cells.join("");
}

function renderTextBlock(text, emptyText = "暂无填写") {
  const lines = splitLines(text);
  if (!lines.length) return `<p class="muted-text">${emptyText}</p>`;
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}

function renderTeamCards(team) {
  return `
    <div class="team-grid">
      ${team
        .map(
          (item) => `
            <div class="team-card ${item.value === "未填写" ? "is-empty" : ""}">
              <span class="team-icon">${iconSvg(item.icon)}</span>
              <span>
                <b>${escapeHtml(item.label)}</b>
                <small>${escapeHtml(item.value)}</small>
              </span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function getProjectSubmissions(projectId) {
  return getProjectReportHistory(submissions, projectId);
}

function getCurrentWeekSubmission(projectId) {
  return submissions.find((item) => item.projectId === projectId && Number(item.week) === CURRENT_REPORT_WEEK);
}

function getLatestProjectSubmission(projectId) {
  return getProjectSubmissions(projectId)[0];
}

function renderLatestProjectProgress(project) {
  const report = getLatestProjectReport(submissions, project.id);
  if (!report) return '<p class="muted-text">暂无周度维护信息</p>';
  return `
    <div class="current-progress-card">
      <header>
        <strong>第${escapeHtml(report.week || CURRENT_REPORT_WEEK)}周 · ${escapeHtml(report.memberName || "未记录成员")}</strong>
        <span>${escapeHtml(new Date(report.updatedAt || report.createdAt).toLocaleString("zh-CN"))}</span>
      </header>
      <p>${escapeHtml(report.progress || "暂无进展内容")}</p>
      ${
        report.milestoneTitle
          ? `<small>关联里程碑：${escapeHtml(report.milestoneTitle)}${report.milestoneDate ? ` · ${escapeHtml(report.milestoneDate)}` : ""}</small>`
          : ""
      }
    </div>
  `;
}

function renderProjectRiskBlock(project) {
  const risks = (project.risks || []).filter((risk) => risk.status !== "closed");
  if (!risks.length) return '<p class="muted-text">当前项目暂无明显风险</p>';
  return `
    <div class="risk-list detail-risk-list">
      ${risks
        .map(
          (risk) => `
            <button class="risk-item" data-project="${project.id}">
              <header>
                <h3>${escapeHtml(risk.title)}</h3>
                <span class="risk-level risk-${risk.level}">${risk.level === "high" ? "高" : risk.level === "low" ? "低" : "中"}</span>
              </header>
              <p>${risk.owner ? `责任人 ${escapeHtml(risk.owner)} · ` : ""}${
            risk.dueDate ? `计划 ${escapeHtml(risk.dueDate)} · ` : ""
          }${escapeHtml(risk.detail)}</p>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function getReportProject() {
  const select = document.querySelector("#reportProjectSelect");
  const reportableProjects = getReportableProjects();
  return reportableProjects.find((item) => item.id === select?.value) || reportableProjects[0] || projects[0];
}

function hasActiveMilestoneDraft(project) {
  return Boolean(
    project &&
    state.milestoneManageMode &&
    getReportProject()?.id === project.id &&
    Array.isArray(draftStore.milestones[project.id])
  );
}

function getReportMilestoneSource(project) {
  if (hasActiveMilestoneDraft(project)) {
    return draftStore.milestones[project.id];
  }
  return project?.milestones || [];
}

function getReportMilestones(project) {
  if (!project) return [];
  return [...getReportMilestoneSource(project)].sort((a, b) => {
    const aTime = a.dateInfo?.date?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bTime = b.dateInfo?.date?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });
}

function getMilestoneWindow(project, milestone) {
  const milestones = getReportMilestones(project).filter((item) => item.dateInfo);
  const index = milestones.findIndex((item) => item.id === milestone?.id);
  const previous = index > 0 ? milestones[index - 1] : null;
  const start = previous?.dateInfo?.date || CYCLE_START;
  const end = milestone?.dateInfo?.date || new Date(start.getTime() + 21 * 86400000);
  const diffDays = Math.max(1, Math.ceil((end - start) / 86400000));
  const weekCount = Math.min(12, Math.max(1, Math.ceil(diffDays / 7)));
  const currentOffset = Math.floor((TODAY - start) / 86400000);
  const hasStarted = TODAY >= start;
  const hasEnded = TODAY > end;
  const currentWeek = hasStarted ? Math.min(weekCount, Math.max(1, Math.ceil((currentOffset + 1) / 7))) : 0;
  return {
    start,
    end,
    startKey: formatDateKey(start.getFullYear(), start.getMonth() + 1, start.getDate()),
    endKey: formatDateKey(end.getFullYear(), end.getMonth() + 1, end.getDate()),
    weekCount,
    currentWeek,
    hasStarted,
    hasEnded,
    label: `${start.getMonth() + 1}/${start.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`,
  };
}

function getReportMilestone(project = getReportProject()) {
  const milestones = getReportMilestones(project);
  if (!milestones.length) return null;
  const selected = milestones.find((item) => item.id === state.selectedReportMilestoneId);
  if (selected) return selected;
  const next = getNextMilestone(project);
  state.selectedReportMilestoneId = next?.id || milestones[0].id;
  return milestones.find((item) => item.id === state.selectedReportMilestoneId) || milestones[0];
}

function getWeekSubmission(projectId, week = state.selectedWeek, milestoneId = state.selectedReportMilestoneId) {
  return submissions.find(
    (item) =>
      item.projectId === projectId &&
      Number(item.week) === Number(week) &&
      (!milestoneId || item.milestoneId === milestoneId)
  );
}

function getMilestoneSubmissionCount(projectId, milestoneId) {
  return submissions.filter((item) => item.projectId === projectId && item.milestoneId === milestoneId).length;
}

function syncReportMilestoneFields() {
  const form = document.querySelector("#memberReportForm");
  const project = getReportProject();
  const milestone = getReportMilestone(project);
  if (!form || !project || !milestone) return;
  form.elements.milestoneTitle.value = milestone.title || "";
  form.elements.milestoneDate.value = milestone.dateInfo?.key || "";
  form.elements.milestoneStatus.value = editableMilestoneStatusMap[milestone.status] ? milestone.status : "planned";
}

function selectReportMilestone(milestoneId, week) {
  const project = getReportProject();
  const milestone = getReportMilestones(project).find((item) => item.id === milestoneId) || getReportMilestone(project);
  if (!project || !milestone) return;
  state.selectedReportMilestoneId = milestone.id;
  state.milestoneEditMode = false;
  state.saveNotice = "";
  const windowInfo = getMilestoneWindow(project, milestone);
  state.selectedWeek = week ? Math.min(Number(week), windowInfo.weekCount) : windowInfo.currentWeek || 1;
  syncReportMilestoneFields();
  renderReportMilestoneRail();
  renderReportProjectBrief();
  renderWeekTimeline();
  syncReportMilestoneFields();
  renderReportStatusPanel();
}

function renderProjectSubmissions(projectId) {
  const items = getProjectSubmissions(projectId).slice(0, 3);
  if (!items.length) return '<p class="muted-text">暂无成员填报记录</p>';
  return `
    <div class="mini-report-list">
      ${items
        .map(
          (item) => `
            <article class="mini-report">
              <strong>第${escapeHtml(item.week || CURRENT_REPORT_WEEK)}周 · ${escapeHtml(item.memberName)} · ${escapeHtml(item.memberRole)}</strong>
              <span>${escapeHtml(item.milestoneTitle || "未关联里程碑")}</span>
              <p>${escapeHtml(compactText(item.progress, 110))}</p>
              <span>${escapeHtml(new Date(item.updatedAt || item.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }))}</span>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderDetailMetricBlock(project) {
  const metrics = getProjectMetricItems(project);
  const chips = metrics.length
    ? metrics
        .map((item) => `<span class="metric-chip"><b>${escapeHtml(item.current || "待填")}</b>${escapeHtml(item.name)}</span>`)
        .join("")
    : '<span class="metric-chip is-muted">待结构化</span>';
  const firstProgress = getMetricProgress(metrics[0] || {});

  return `
    <div class="detail-metric-panel" style="--project-color: ${project.color}">
      <div class="metric-editor-chart" style="--chart-angle: ${((firstProgress ?? project.progress) || 0) * 3.6}deg">
        <div class="metric-ring">
          <span>${(firstProgress ?? project.progress) || 0}%</span>
        </div>
        <div>
          <strong>指标达成</strong>
          <p>${escapeHtml(metrics[0]?.observation || compactText(project.metricsText, 92))}</p>
        </div>
      </div>
      <div class="metric-chip-row">${chips}</div>
    </div>
  `;
}

function renderDetail() {
  const project = projects.find((item) => item.id === state.selectedId) || getFilteredProjects()[0];
  const container = document.querySelector("#projectDetail");
  if (!project) {
    container.innerHTML = '<div class="empty-state">请选择一个项目</div>';
    return;
  }

  const milestoneState = getVisibleMilestones(getReportMilestones(project), {
    expanded: Boolean(state.expandedProjectMilestones[project.id]),
    limit: 6,
  });
  const milestones = milestoneState.visible.map(
    (milestone) => `
      <button class="timeline-item" data-project="${milestone.projectId}" data-milestone="${milestone.id}">
        <span class="timeline-date">${escapeHtml(milestone.dateInfo?.label || "未标日期")}</span>
        <span class="timeline-content">
          <strong>${escapeHtml(milestone.title)}</strong>
          <span>${milestoneStatusMap[milestone.status]} · ${escapeHtml(milestone.source)}</span>
        </span>
      </button>
    `
  );
  const milestoneToggle = milestoneState.hiddenCount
    ? `<button class="timeline-limit-action" type="button" data-toggle-detail-milestones="${project.id}">展开其余 ${milestoneState.hiddenCount} 个节点</button>`
    : milestoneState.isExpanded && getReportMilestones(project).length > 6
      ? `<button class="timeline-limit-action" type="button" data-toggle-detail-milestones="${project.id}">收起节点</button>`
      : "";
  const updateBlock = renderProjectSubmissions(project.id);
  const overview = `
    <div class="detail-overview-grid">
      <article>
        <span>负责人</span>
        <strong>${escapeHtml(project.owner || "未填写")}</strong>
      </article>
      <article>
        <span>当前阶段</span>
        <strong>${escapeHtml(formatProjectStageLabel(project.stage))}</strong>
      </article>
    </div>
    <div class="detail-block">
      <h3>项目概述</h3>
      ${renderTextBlock(project.overallText)}
    </div>
    <div class="detail-block">
      <h3>项目指标</h3>
      ${renderDetailMetricBlock(project)}
    </div>
    <div class="detail-block">${renderTextBlock(project.metricsText, "暂无指标说明")}</div>
    <div class="detail-block">
      <h3>项目组构成</h3>
      ${renderTeamCards(project.team)}
    </div>
  `;
  const tabContent = {
    overview,
    milestones: `
      <div class="detail-block">
        <h3>当前进展</h3>
        ${renderLatestProjectProgress(project)}
      </div>
      <div class="detail-block">
        <h3>里程碑计划</h3>
        <div class="timeline">${milestones.join("") || '<p class="muted-text">暂无可识别里程碑</p>'}</div>
        ${milestoneToggle}
      </div>
    `,
    updates: `
      <div class="detail-block">
        <h3>成员更新记录</h3>
        ${updateBlock}
      </div>
    `,
    risks: `
      <div class="detail-block">
        <h3>风险提示</h3>
        ${renderProjectRiskBlock(project)}
      </div>
    `,
  };
  const tabs = [
    { key: "overview", label: "概览" },
    { key: "milestones", label: "里程碑" },
    { key: "updates", label: "更新" },
    { key: "risks", label: "风险" },
  ];
  if (state.detailTab === "metrics") state.detailTab = "overview";
  if (!tabContent[state.detailTab]) state.detailTab = "overview";

  container.innerHTML = `
    <div class="detail-title">
      <h2>${escapeHtml(project.shortName)}</h2>
      <p>${escapeHtml(formatProjectStageLabel(project.stage))} · ${
    project.milestones.length
  } 个节点</p>
    </div>
    <div class="detail-tabs">
      ${tabs
        .map(
          (tab) => `<button class="detail-tab ${state.detailTab === tab.key ? "is-active" : ""}" type="button" data-detail-tab="${tab.key}">${tab.label}</button>`
        )
        .join("")}
    </div>
    <div class="detail-tab-panel">${tabContent[state.detailTab]}</div>
  `;
}

function renderRisks() {
  const risks = getFilteredProjects()
    .flatMap((project) =>
      project.risks.filter((risk) => risk.status !== "closed").map((risk) => ({
        ...risk,
        projectId: project.id,
        projectName: project.shortName,
      }))
    )
    .sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.level] - { high: 0, medium: 1, low: 2 }[b.level]));

  const container = document.querySelector("#riskList");
  if (!container) return;
  if (!risks.length) {
    container.innerHTML = '<div class="empty-state">当前筛选下暂无明显风险</div>';
    return;
  }

  const visibleRisks = state.risksExpanded ? risks : risks.slice(0, 4);
  const toggle =
    risks.length > 4
      ? `<button class="text-action" type="button" id="riskToggleButton">${
          state.risksExpanded ? "收起风险" : `查看全部 ${risks.length} 项风险`
        }</button>`
      : "";

  container.innerHTML =
    visibleRisks
    .map(
      (risk) => `
        <button class="risk-item" data-project="${risk.projectId}">
          <header>
            <h3>${escapeHtml(risk.title)}</h3>
            <span class="risk-level risk-${risk.level}">${risk.level === "high" ? "高" : "中"}</span>
          </header>
          <p>${escapeHtml(risk.projectName)} · ${risk.owner ? `责任人 ${escapeHtml(risk.owner)} · ` : ""}${
        risk.dueDate ? `计划 ${escapeHtml(risk.dueDate)} · ` : ""
      }${escapeHtml(risk.detail)}</p>
        </button>
      `
    )
      .join("") + toggle;
}

function renderMetrics() {
  if (!document.querySelector("#metricGrid") || !document.querySelector("#metricScopeLabel")) return;
  const selected = projects.find((item) => item.id === state.selectedId);
  const filtered = getFilteredProjects();
  const source = selected && filtered.some((project) => project.id === selected.id) ? [selected] : filtered;
  const metrics = source.map((project) => ({
    project,
    highlights: project.metricHighlights,
  }));

  document.querySelector("#metricScopeLabel").textContent =
    source.length === 1 ? source[0].shortName : `当前筛选 ${source.length} 个项目`;

  document.querySelector("#metricGrid").innerHTML = metrics
    .map(({ project, highlights }) => {
      const chips = highlights.length
        ? highlights
            .map((item) => `<span class="metric-chip"><b>${escapeHtml(item.value)}</b>${escapeHtml(item.label)}</span>`)
            .join("")
        : '<span class="metric-chip is-muted">待结构化</span>';

      return `
        <article class="metric-card" data-project="${project.id}">
          <header>
            <div>
              <h3>${escapeHtml(project.shortName)}</h3>
              <p>${escapeHtml(project.businessLine || "未填业务线")}</p>
            </div>
            <span>${project.metricHighlights.length ? "已量化" : "待补充"}</span>
          </header>
          <div class="metric-chip-row">${chips}</div>
          <div class="metric-copy">${renderTextBlock(project.metricsText, "暂无指标说明")}</div>
        </article>
      `;
    })
    .join("");
}

function renderMetricInlineProgress(metric) {
  if (metric.progress === null) return "";
  return `
    <div class="metric-inline-progress" aria-label="进度 ${metric.progress}%">
      <span style="width:${metric.progress}%"></span>
    </div>
  `;
}

function renderMetricCatalogRecord(metric) {
  const detail = splitMetricObservation(metric.observation, metric.observable);
  const currentText = metric.current || "待填当前值";
  const targetText = metric.target ? `目标 ${metric.target}` : "未设目标";
  const progressText = metric.progress !== null ? `${metric.progress}%` : "定性跟踪";
  return `
    <article class="metric-catalog-row" style="--project-color: ${metric.color}">
      <div class="metric-catalog-main">
        <span class="metric-status-badge is-status-${metric.status.key}">${escapeHtml(metric.status.label)}</span>
        <div>
          <strong>${escapeHtml(metric.name)}</strong>
          <small>${escapeHtml(metric.projectName)} · ${escapeHtml(metric.businessLine)}</small>
        </div>
      </div>
      <div class="metric-catalog-value">
        <b>${escapeHtml(currentText)}</b>
        <span>${escapeHtml(targetText)}</span>
      </div>
      <div class="metric-catalog-progress">
        ${renderMetricInlineProgress(metric)}
        <span>${escapeHtml(progressText)}</span>
      </div>
      <div class="metric-catalog-detail">
        <span><b>计算口径</b>${escapeHtml(compactText(detail.observation || "未维护计算口径", 72))}</span>
        <span><b>可观测时间</b>${escapeHtml(detail.observable || "未明确")}</span>
      </div>
    </article>
  `;
}

function renderMetricStatusBars(statusCounts, total) {
  if (!statusCounts.length || !total) return '<div class="metric-status-bar is-empty"></div>';
  return `
    <div class="metric-status-bar" aria-label="指标状态构成">
      ${statusCounts
        .map(
          (item) => `
            <span class="is-status-${item.key}" style="width:${Math.max(8, Math.round((item.count / total) * 100))}%"></span>
          `
        )
        .join("")}
    </div>
  `;
}

function formatMetricValue(value) {
  return String(value || "").trim() || "无";
}

function isEmptyMetricDisplayValue(value) {
  const text = String(value || "").trim();
  return !text || text === "无" || text === "-" || /^(暂无|待填|待补充|待持续观测)$/i.test(text);
}

function renderProjectMetricRow(metric) {
  const detail = splitMetricObservation(metric.observation, metric.observable);
  const currentValue = formatMetricValue(metric.current);
  const targetValue = formatMetricValue(metric.target);
  const currentClass = `project-metric-value is-current${isEmptyMetricDisplayValue(currentValue) ? " is-empty-value" : ""}`;
  const targetClass = `project-metric-value${isEmptyMetricDisplayValue(targetValue) ? " is-empty-value" : ""}`;
  return `
    <details class="project-metric-row is-status-${metric.status.key}">
      <summary>
        <span class="metric-status-dot is-status-${metric.status.key}"></span>
        <strong>${escapeHtml(metric.name)}</strong>
        <span class="${currentClass}">${escapeHtml(currentValue)}</span>
        <span class="${targetClass}">${escapeHtml(targetValue)}</span>
        <em>详情</em>
      </summary>
      <div class="project-metric-detail">
        <span><b>计算口径</b>${escapeHtml(detail.observation || "未维护计算口径")}</span>
        <span><b>可观测时间</b>${escapeHtml(detail.observable || "未明确")}</span>
      </div>
    </details>
  `;
}

function renderMetricProjectCard(group) {
  const statusPills = group.statusCounts.length
    ? group.statusCounts
        .map((item) => `<span class="metric-status-badge is-status-${item.key}">${escapeHtml(item.label)} ${item.count}</span>`)
        .join("")
    : '<span class="metric-status-badge is-status-empty">暂无指标</span>';
  const visibleMetrics = group.metrics.slice(0, 4);
  const hiddenMetrics = group.metrics.slice(4);
  const metricRows = group.metrics.length
    ? `
      ${visibleMetrics.map(renderProjectMetricRow).join("")}
      ${
        hiddenMetrics.length
          ? `
            <details class="metric-more">
              <summary><span class="metric-more-open">展开更多 ${hiddenMetrics.length} 项</span><span class="metric-more-close">收起指标</span></summary>
              <div>${hiddenMetrics.map(renderProjectMetricRow).join("")}</div>
            </details>
          `
          : ""
      }
    `
    : '<div class="metric-empty-project">最新指标表未配置结构化指标</div>';
  return `
    <article class="metric-project-card is-status-${group.leadStatus}" style="--project-color: ${group.color}">
      <header>
        <div>
          <span>${escapeHtml(group.businessLine)} · ${escapeHtml(group.owner)}</span>
          <h3>${escapeHtml(group.projectName)}</h3>
        </div>
        <strong>${group.metricCount}</strong>
      </header>
      <div class="metric-project-meta">
        <span>当前值 ${group.currentCount}/${group.metricCount}</span>
        <span>目标值 ${group.targetCount}/${group.metricCount}</span>
      </div>
      <div class="metric-project-statuses">${statusPills}</div>
      <div class="project-metric-list">${metricRows}</div>
    </article>
  `;
}

function renderMetricProjectBoard(container, groups) {
  if (!container) return;
  container.innerHTML = groups.length
    ? groups.map(renderMetricProjectCard).join("")
    : '<div class="metric-empty-chart">暂无项目指标</div>';
}

function renderMetricAllGroups(container, groups) {
  if (!container) return;
  container.innerHTML = groups.length
    ? groups
        .map(
          (group) => `
            <section class="metric-business-group">
              <header>
                <div>
                  <h3>${escapeHtml(group.label)}</h3>
                  <span>${group.projectCount} 个项目 · ${group.metricCount} 项指标</span>
                </div>
              </header>
              <div class="metric-catalog-list">
                ${group.metrics.map(renderMetricCatalogRecord).join("")}
              </div>
            </section>
          `
        )
        .join("")
    : '<div class="metric-empty-chart">暂无项目指标</div>';
}

function renderMetricDashboard() {
  if (!document.querySelector("#metricDashboardSummary")) return;
  const model = buildMetricDashboardModel(projects, getProjectMetricItems);
  const summaryCards = [
    { label: "结构化指标", value: model.summary.metricCount, helper: `${model.summary.projectCount} 个项目` },
    { label: "完整度", value: `${model.summary.readiness}%`, helper: `${model.summary.currentCount} 项已有当前值` },
    { label: "推进中", value: model.summary.inProgressCount, helper: "含定性跟踪项" },
    { label: "待完善", value: model.summary.needsAttentionCount, helper: `${model.summary.goalOnlyCount} 项仅维护目标` },
  ];

  document.querySelector("#metricDashboardSummary").innerHTML = summaryCards
    .map(
      (card) => `
        <article>
          <span>${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(card.value)}</strong>
          <small>${escapeHtml(card.helper)}</small>
        </article>
      `
    )
    .join("");

  const catalogMeta = document.querySelector("#metricCatalogMeta");
  if (catalogMeta) {
    catalogMeta.textContent = `${model.metricGroups.length} 个业务线 · ${model.summary.metricCount} 项指标，按项目和业务线有序展开`;
  }
  renderMetricProjectBoard(document.querySelector("#metricProjectBoard"), model.projectGroups);
  renderMetricAllGroups(document.querySelector("#metricAllGroups"), model.metricGroups);
}

function renderProjectSelects() {
  const pickerState = buildReportProjectPickerState(projects, memberProfile);
  const options = pickerState.projects
    .map((project) => `<option value="${project.id}">${escapeHtml(project.shortName)} · ${escapeHtml(project.businessLine || "未填业务线")}</option>`)
    .join("");
  const reportProjectSelect = document.querySelector("#reportProjectSelect");
  if (reportProjectSelect) {
    reportProjectSelect.innerHTML = options || '<option value="">暂无可维护项目</option>';
    reportProjectSelect.disabled = pickerState.isDisabled;
    reportProjectSelect.classList.toggle("is-hidden", pickerState.shouldHidePicker);
    reportProjectSelect.closest(".report-project-picker")?.classList.toggle("is-hidden", pickerState.shouldHidePicker);
    reportProjectSelect.value = pickerState.selectedProjectId;
    if (memberProfile && pickerState.selectedProjectId) memberProfile.projectId = pickerState.selectedProjectId;
  }
}

function renderAuthCenter() {
  const authPanel = document.querySelector("#authPanelContent");
  const roleBindingPanel = document.querySelector("#roleBindingContent");
  const roleBindingWrapper = document.querySelector("#roleBindingPanel");
  const loginWrapper = document.querySelector("#memberRegisterPanel");
  const registerHero = document.querySelector(".register-layout .member-hero");
  const registerLayout = document.querySelector(".register-layout");
  if (!authPanel || !roleBindingPanel || !roleBindingWrapper) return;
  const authModel = buildAuthPanelViewModel({ user: memberProfile, projects });
  loginWrapper?.classList.remove("is-hidden");
  registerHero?.classList.add("is-hidden");
  loginWrapper?.classList.toggle("is-login-only", !memberProfile);
  registerLayout?.classList.toggle("is-login-only", !memberProfile);
  registerLayout?.classList.toggle("is-managing-identity", Boolean(authModel.showIdentityManagement && state.identityManageOpen));

  if (authState.loading) {
    loginWrapper?.classList.remove("is-hidden");
    loginWrapper?.classList.add("is-login-only");
    registerHero?.classList.add("is-hidden");
    registerLayout?.classList.add("is-login-only");
    registerLayout?.classList.remove("is-managing-identity");
    authPanel.innerHTML = '<div class="empty-state">正在校验飞书登录状态...</div>';
    roleBindingWrapper.classList.add("is-hidden");
    roleBindingPanel.innerHTML = '<div class="empty-state">稍候加载权限信息</div>';
    return;
  }

  if (!memberProfile) {
    state.identityManageOpen = false;
    authPanel.innerHTML = `
      <div class="auth-stack login-entry auth-entry-premium">
        <div class="auth-entry-main">
          <div class="auth-mark" aria-hidden="true">
            <span></span>
            <b></b>
          </div>
          <div class="auth-copy">
            <span class="login-status-dot">飞书统一身份</span>
            <strong>${escapeHtml(authModel.title)}</strong>
            <p>${escapeHtml(authModel.subtitle)}</p>
          </div>
          <button class="primary-action feishu-login-button" type="button" data-feishu-login>${escapeHtml(authModel.actions[0].label)}</button>
        </div>
        ${authState.error ? `<div class="save-notice">${escapeHtml(authState.error)}</div>` : ""}
      </div>
    `;
    roleBindingWrapper.classList.add("is-hidden");
    roleBindingPanel.innerHTML = "";
    return;
  }

  authPanel.innerHTML = `
    <div class="identity-card">
      <div class="identity-main">
        <span class="identity-avatar">${escapeHtml(getDisplayInitials(memberProfile.name))}</span>
        <div class="identity-copy">
          <strong>${escapeHtml(memberProfile.name)}</strong>
          <span>${escapeHtml(getUserContactLabel(memberProfile))}</span>
        </div>
      </div>
      <div class="identity-meta">
        <span class="role-badge ${memberProfile.isAdmin ? "is-admin" : "is-member"}">${escapeHtml(memberProfile.role)}</span>
        <span class="phase-pill">${memberProfile.feishuLinked ? "飞书已绑定" : "未绑定"}</span>
      </div>
      <div class="identity-summary">
        <span>默认项目：${escapeHtml(authModel.defaultProjectName)}</span>
      </div>
      <div class="auth-actions">
        ${authModel.actions
          .map((action) => {
            if (action.key === "logout") return `<button class="secondary-action" type="button" data-logout>${escapeHtml(action.label)}</button>`;
            if (action.key === "identity") {
              const label = state.identityManageOpen ? "收起身份管理" : action.label;
              return `<button class="secondary-action" type="button" data-toggle-identity-management>${escapeHtml(label)}</button>`;
            }
            const className = action.tone === "primary" ? "primary-action compact-action" : "secondary-action";
            return `<button class="${className}" type="button" data-view="${escapeHtml(action.key)}">${escapeHtml(action.label)}</button>`;
          })
          .join("")}
      </div>
    </div>
  `;

  if (!authModel.showIdentityManagement || !state.identityManageOpen) {
    roleBindingWrapper.classList.add("is-hidden");
    roleBindingPanel.innerHTML = "";
    return;
  }

  roleBindingWrapper.classList.remove("is-hidden");

  const adminUsers = sortUsersByName(authState.users.filter((user) => user.roleKey === "ADMIN"));
  const { projectUsers, unassignedUsers } = buildProjectUserGroups(
    authState.users.filter((item) => item.roleKey !== "ADMIN"),
    projects
  );

  const adminGroup = adminUsers.length
    ? { project: { id: "__admins", shortName: "管理员", businessLine: "身份与全局管理", color: "#5b4cc4" }, users: adminUsers }
    : null;
  const memberGroupEntries = [
    ...projects
      .filter((p) => projectUsers[p.id]?.length)
      .map((p) => ({ project: p, users: sortUsersByName(projectUsers[p.id]) })),
    ...(unassignedUsers.length
      ? [{ project: { id: "__unassigned", shortName: "未分配项目", businessLine: "暂未指定默认项目", color: "#6b7280" }, users: sortUsersByName(unassignedUsers) }]
      : []),
  ];

  const renderProjectOptions = (selectedId) =>
    `<option value="" ${!selectedId ? "selected" : ""}>不指定默认项目</option>` +
    projects
      .map(
        (p) => `<option value="${p.id}" ${selectedId === p.id ? "selected" : ""}>${escapeHtml(p.shortName)}</option>`
      )
      .join("");

  const refreshLabel = authState.usersRefreshing ? "刷新中..." : "刷新";
  const syncChatLabel = authState.chatSyncing ? "同步中..." : "同步我的飞书群聊";
  const renderUserGroupCard = ({ project, users }, options = {}) => {
    const isExpanded = state.expandedProjectGroups[project.id] !== false;
    const arrow = isExpanded ? "▾" : "▸";
    const compact = options.compact ? " is-compact" : "";
    return `
      <article class="project-group-card${compact} ${isExpanded ? "is-expanded" : ""}" data-project-group="${project.id}">
        <button class="project-group-head" type="button" data-toggle-project-group="${project.id}">
          <span class="project-group-avatar" style="--project-color: ${escapeHtml(project.color || "#6b7280")}">${escapeHtml(project.shortName.slice(0, 1))}</span>
          <div class="project-group-meta">
            <strong>${escapeHtml(project.shortName)}</strong>
            <span>${users.length} 人 · ${escapeHtml(project.businessLine || "")}</span>
          </div>
          <span class="project-group-arrow">${arrow}</span>
        </button>
        <div class="project-group-body ${isExpanded ? "" : "is-collapsed"}">
          <div class="avatar-strip ${options.compact ? "is-compact" : ""}">
            ${users
              .map(
                (user) => `
                  <button class="avatar-chip" type="button" data-open-user-edit="${user.id}" title="${escapeHtml(user.name)} · ${escapeHtml(getUserContactLabel(user))}">
                    ${options.compact ? "" : `<span class="identity-avatar is-small">${escapeHtml(getDisplayInitials(user.name))}</span>`}
                    <span class="avatar-chip-label">${escapeHtml(user.name)}</span>
                  </button>
                `
              )
              .join("")}
          </div>
        </div>
      </article>
    `;
  };

  roleBindingPanel.innerHTML = `
    <div class="role-binding-head">
      <strong>${authState.users.length} 位已登录用户</strong>
      <div class="role-binding-toolbar">
        <button class="tiny-action" type="button" data-view="dashboard">返回看板</button>
        <button class="tiny-action" type="button" data-logout>退出登录</button>
        <button class="tiny-action" type="button" data-refresh-users ${authState.usersRefreshing ? "disabled" : ""}>${refreshLabel}</button>
      </div>
    </div>
    ${authState.bindingError ? `<div class="save-notice">${escapeHtml(authState.bindingError)}</div>` : ""}
    ${
      authState.chatSyncErrors.length
        ? `<div class="sync-error-list">${authState.chatSyncErrors
            .slice(0, 5)
            .map((item) => `<p><strong>${escapeHtml(item.name || "未命名群聊")}</strong>${escapeHtml(item.message || "成员读取失败")}</p>`)
            .join("")}</div>`
        : ""
    }
    <div class="identity-groups-layout">
      <section class="identity-admin-column">
        <div class="identity-group-section-head"><strong>管理员</strong><span>${adminUsers.length} 人</span></div>
        ${adminGroup ? renderUserGroupCard(adminGroup, { compact: true }) : '<div class="empty-state">暂无管理员</div>'}
      </section>
      <section class="identity-member-column">
        <div class="identity-group-section-head">
          <strong>项目成员</strong>
          <span>${memberGroupEntries.reduce((sum, group) => sum + group.users.length, 0)} 人</span>
        </div>
        <div class="project-group-list">
          ${memberGroupEntries.map((entry) => renderUserGroupCard(entry)).join("")}
          ${!memberGroupEntries.length ? '<div class="empty-state">暂无项目成员</div>' : ""}
        </div>
      </section>
    </div>
    <div class="role-binding-head project-chat-head">
      <strong>项目群聊绑定</strong>
      <div class="role-binding-toolbar">
        <button class="tiny-action" type="button" data-sync-my-feishu-chats ${authState.chatSyncing ? "disabled" : ""}>${syncChatLabel}</button>
      </div>
      <span>同步群聊后选择项目群，再同步成员。</span>
    </div>
    <div class="project-create-strip">
      <input data-project-create-field="name" value="${escapeHtml(state.projectCreateDraft.name)}" placeholder="项目全称" />
      <input data-project-create-field="shortName" value="${escapeHtml(state.projectCreateDraft.shortName)}" placeholder="项目简称" />
      <input data-project-create-field="businessLine" value="${escapeHtml(state.projectCreateDraft.businessLine)}" placeholder="所属业务线" />
      <button class="primary-action compact-action" type="button" data-create-project>新增项目</button>
    </div>
    <div class="role-binding-list chat-binding-grid">
      ${projects
        .map((project) => {
          const chat = getFeishuChatById(project.feishuChatId);
          const chatMembers = chat?.members || [];
          const chatMemberKey = `project:${project.id}`;
          const chatName = chat?.name || (project.feishuChatId ? "已绑定群聊" : "未选择群聊");
          const syncProjectChatKey = buildActionKey("sync-project-chat", project.id);
          const isSyncingProjectChat = isActionPending(state.pendingActions, syncProjectChatKey);
          return `
            <article class="binding-row project-chat-row" data-project-chat-row="${project.id}">
              <div class="binding-user">
                <span class="identity-avatar is-small">${escapeHtml(project.shortName.slice(0, 1))}</span>
                <div>
                  <strong>${escapeHtml(project.shortName)}</strong>
                  <span>${escapeHtml(project.businessLine || "未填业务线")}</span>
                </div>
              </div>
              <div class="project-chat-summary">
                <span>项目群</span>
                <strong>${escapeHtml(chatName)}</strong>
                <input type="hidden" data-project-chat-id="${project.id}" value="${escapeHtml(project.feishuChatId || "")}" />
              </div>
              <div class="project-chat-members">
                ${renderChatMemberChips(chatMembers, {
                  limit: 6,
                  groupId: chatMemberKey,
                  expanded: Boolean(state.expandedChatMembers[chatMemberKey]),
                })}
              </div>
              <div class="binding-actions">
                <button class="secondary-action compact-action" type="button" data-open-chat-picker="${project.id}">选择群聊</button>
                <button class="secondary-action compact-action" type="button" data-sync-project-chat="${project.id}"${actionAttrs(syncProjectChatKey)}>${isSyncingProjectChat ? "同步中..." : "同步成员"}</button>
                <button class="ghost-danger compact-action" type="button" data-delete-project="${project.id}">删除</button>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderChatPickerModal() {
  const modal = document.querySelector("#chatPickerModal");
  if (!modal) return;
  const project = projects.find((item) => item.id === state.chatPickerProjectId);
  const keyword = state.chatSearch.trim().toLowerCase();
  const chats = authState.chats.filter((chat) => {
    if (!keyword) return true;
    const text = `${chat.name || ""} ${chat.chatId || ""} ${(chat.members || []).map((member) => member.name).join(" ")}`.toLowerCase();
    return text.includes(keyword);
  });

  modal.classList.toggle("is-open", state.chatPickerOpen);
  modal.setAttribute("aria-hidden", state.chatPickerOpen ? "false" : "true");
  modal.innerHTML = `
    <section class="modal-card chat-picker-card" role="dialog" aria-modal="true" aria-labelledby="chatPickerTitle">
      <button class="modal-close" type="button" data-close-chat-picker aria-label="关闭群聊选择">×</button>
      <p class="modal-eyebrow">项目群聊选择</p>
      <h3 id="chatPickerTitle">${escapeHtml(project?.shortName || "选择项目群聊")}</h3>
      <div class="chat-picker-tools">
        <input id="chatPickerSearch" value="${escapeHtml(state.chatSearch)}" placeholder="搜索群聊名称或成员姓名" />
        <button class="secondary-action compact-action" type="button" data-refresh-chat-list ${authState.chatsRefreshing ? "disabled" : ""}>${authState.chatsRefreshing ? "刷新中..." : "刷新列表"}</button>
      </div>
      <div class="chat-picker-list">
        ${
          chats.length
            ? chats
                .map(
                  (chat) => `
                    <article class="chat-option">
                      <div class="chat-option-main">
                        <strong>${escapeHtml(chat.name || "未命名群聊")}</strong>
                        <span>${Number(chat.memberCount || chat.members?.length || 0)} 人</span>
                        ${renderChatMemberChips(chat.members || [], {
                          limit: 12,
                          groupId: `chat:${chat.chatId}`,
                          expanded: Boolean(state.expandedChatMembers[`chat:${chat.chatId}`]),
                        })}
                      </div>
                      ${
                        (() => {
                          const pickKey = buildActionKey("pick-chat", state.chatPickerProjectId, chat.chatId);
                          const isPicking = isActionPending(state.pendingActions, pickKey);
                          return `<button class="primary-action compact-action" type="button" data-pick-chat="${escapeHtml(chat.chatId)}"${actionAttrs(pickKey)}>${isPicking ? "同步中..." : "选择"}</button>`;
                        })()
                      }
                    </article>
                  `
                )
                .join("")
            : '<div class="empty-state">暂无可选群聊。请先点击“同步我的飞书群聊”。</div>'
        }
      </div>
    </section>
  `;
}

function renderUserEditModal() {
  const modal = document.querySelector("#userEditModal");
  if (!modal) return;
  const user = authState.users.find((u) => u.id === state.userEditTargetId);
  modal.classList.toggle("is-open", state.userEditModalOpen && Boolean(user));
  modal.setAttribute("aria-hidden", state.userEditModalOpen && user ? "false" : "true");
  if (!user) {
    modal.innerHTML = "";
    return;
  }
  const projectOptions = `<option value="">不指定默认项目</option>` +
    projects.map((p) => `<option value="${p.id}" ${user.projectId === p.id ? "selected" : ""}>${escapeHtml(p.shortName)}</option>`).join("");
  const saveUserKey = buildActionKey("save-user-edit", user.id);
  const isSavingUser = isActionPending(state.pendingActions, saveUserKey);

  modal.innerHTML = `
    <section class="modal-card user-edit-card" role="dialog" aria-modal="true" aria-labelledby="userEditTitle">
      <button class="modal-close" type="button" data-close-user-edit aria-label="关闭">×</button>
      <p class="modal-eyebrow">人员角色与项目绑定</p>
      <div class="user-edit-header">
        <span class="identity-avatar">${escapeHtml(getDisplayInitials(user.name))}</span>
        <div>
          <h3 id="userEditTitle">${escapeHtml(user.name)}</h3>
          <span>${escapeHtml(getUserContactLabel(user))}</span>
        </div>
      </div>
      <div class="user-edit-fields">
        <label>
          <span>系统角色</span>
          <select data-edit-user-role="${user.id}">
            <option value="MEMBER" ${user.roleKey === "MEMBER" ? "selected" : ""}>项目成员</option>
            <option value="ADMIN" ${user.roleKey === "ADMIN" ? "selected" : ""}>管理员</option>
          </select>
        </label>
        <label>
          <span>默认项目</span>
          <select data-edit-user-project="${user.id}">
            ${projectOptions}
          </select>
        </label>
      </div>
      <div class="user-edit-actions">
        <button class="secondary-action" type="button" data-close-user-edit>取消</button>
        <button class="primary-action" type="button" data-save-user-edit="${user.id}"${actionAttrs(saveUserKey)}>${isSavingUser ? "保存中..." : "保存绑定"}</button>
      </div>
    </section>
  `;
}

function renderReportProjectBrief() {
  const project = getReportProject();
  const container = document.querySelector("#reportProjectBrief");
  if (!project) {
    container.innerHTML = '<div class="empty-state">暂无项目</div>';
    return;
  }
  const weekReport = getWeekSubmission(project.id);
  const brief = state.briefEditMode ? ensureBriefDraft(project) : getProjectBriefData(project);
  const saveBriefKey = buildActionKey("save-brief", project.id);
  const isSavingBrief = isActionPending(state.pendingActions, saveBriefKey);

  container.innerHTML = `
    <article class="report-brief-card" style="--project-color: ${project.color}">
      <header class="brief-card-head">
        <span>
          <strong>${escapeHtml(project.shortName)}</strong>
          <small>${escapeHtml(project.businessLine || "未填业务线")}</small>
        </span>
        <button class="tiny-action" type="button" id="briefEditToggle">${state.briefEditMode ? "取消" : "编辑"}</button>
      </header>
      ${
        state.briefEditMode
          ? `
            <div class="brief-editor">
              <label>
                <span>负责人</span>
                <input value="${escapeHtml(brief.owner)}" data-brief-field="owner" placeholder="填写项目负责人" />
              </label>
              <label>
                <span>业务线</span>
                <input value="${escapeHtml(brief.businessLine)}" data-brief-field="businessLine" placeholder="填写业务线" />
              </label>
              <label>
                <span>项目概述</span>
                <textarea rows="6" class="brief-overview-input" data-brief-field="overview" placeholder="补充项目目标、范围和当前重点">${escapeHtml(brief.overview)}</textarea>
              </label>
              <label>
                <span>项目组构成</span>
                <textarea rows="4" data-brief-field="teamSummary" placeholder="例如：产品人数：2&#10;测试人数：1&#10;开发人数：4&#10;算法人数（如有）：1">${escapeHtml(brief.teamSummary)}</textarea>
              </label>
              <button class="secondary-action" type="button" data-save-brief${actionAttrs(saveBriefKey)}>${isSavingBrief ? "保存中..." : "保存概览"}</button>
            </div>
          `
          : `
            <p>负责人：${escapeHtml(brief.owner || "未填写")}</p>
            <p>业务线：${escapeHtml(brief.businessLine || "未填业务线")}</p>
            <p>项目概述：${escapeHtml(compactText(brief.overview, 110))}</p>
            <p>项目组构成：${escapeHtml(compactText(teamSummary(project.team || []), 90))}</p>
          `
      }
      <div class="brief-week ${weekReport ? "is-done" : ""}">
        <b class="week-badge">第${state.selectedWeek}周</b>
        <span>${weekReport ? "已提交，本周内容会出现在项目详情" : "待提交本周更新"}</span>
      </div>
    </article>
  `;
}

function getReportFormValue(name) {
  const form = document.querySelector("#memberReportForm");
  return String(form?.elements?.[name]?.value || "").trim();
}

function hasMeaningfulProgress(text) {
  return hasMeaningfulReportProgress(text);
}

function getMetricReadiness(project) {
  const metrics = getProjectMetricItems(project);
  const filled = metrics.filter((metric) => metric.name && metric.current && (metric.target || metric.observation)).length;
  return {
    done: Boolean(metrics.length && filled === metrics.length),
    label: metrics.length ? `${filled}/${metrics.length} 个指标可同步` : "暂无指标",
    hint: metrics.length ? "需有指标名、当前值，并补目标或观察口径" : "建议先新增项目级指标",
  };
}

function renderReportStatusPanel() {
  const container = document.querySelector("#reportStatusPanel");
  if (!container) return;
  const project = getReportProject();
  const milestone = getReportMilestone(project);

  if (!memberProfile) {
    container.innerHTML = '<div class="empty-state">完成个人信息后，这里会显示本周填报检查</div>';
    return;
  }

  if (!project || !milestone) {
    container.innerHTML = '<div class="empty-state">请选择项目并维护里程碑</div>';
    return;
  }

  const savedReport = getWeekSubmission(project.id, state.selectedWeek, milestone.id);
  const metricStatus = getMetricReadiness(project);
  const milestoneTitle = milestone.title;
  const milestoneDate = milestone.dateInfo?.key || "";
  const progressText = savedReport?.progress || getReportFormValue("progress");
  const riskText = savedReport?.risk || getReportFormValue("risk");
  const items = [
    {
      label: "进展",
      done: hasMeaningfulProgress(progressText),
      hint: progressText ? compactText(progressText, 34) : "建议按已完成 / 进行中 / 下周计划填写",
    },
    {
      label: "里程碑",
      done: Boolean(milestoneTitle && milestoneDate),
      hint: milestoneDate ? `${milestoneDate} · ${milestoneStatusMap[milestone.status] || "计划中"}` : "缺少里程碑日期",
    },
    {
      label: "指标",
      done: metricStatus.done,
      hint: metricStatus.done ? metricStatus.label : metricStatus.hint,
    },
    {
      label: "风险",
      done: Boolean(riskText),
      hint: riskText ? compactText(riskText, 34) : "无风险也建议填写“暂无”",
    },
  ];
  const doneCount = items.filter((item) => item.done).length;
  const isReady = items.slice(0, 3).every((item) => item.done);
  const statusClass = savedReport ? "is-saved" : isReady ? "is-ready" : "is-attention";
  const statusText = savedReport ? `第${state.selectedWeek}周已保存` : isReady ? "可以提交" : "待补充";
  const savedTime = savedReport ? new Date(savedReport.updatedAt || savedReport.createdAt).toLocaleString("zh-CN") : "";

  container.innerHTML = `
    <article class="report-status-card ${statusClass}">
      <div class="status-orbit">
        <strong>${doneCount}</strong>
        <span>/4</span>
      </div>
      <div class="status-copy">
        <b>${escapeHtml(statusText)}</b>
        ${savedReport ? `<p>最近保存：${escapeHtml(savedTime)}</p>` : ""}
      </div>
    </article>
    ${state.saveNotice ? `<div class="save-notice">${escapeHtml(state.saveNotice)}</div>` : ""}
    <div class="report-checklist">
      ${items
        .map(
          (item) => `
            <div class="report-check ${item.done ? "is-done" : ""}">
              <span>${item.done ? "✓" : "!"}</span>
              <b>${escapeHtml(item.label)}</b>
              <small>${escapeHtml(item.hint)}</small>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderMetricTrend(metric) {
  const history = Array.isArray(metric.history) ? metric.history.slice(-6) : [];
  if (!history.length) return "";
  const values = history.map((item) => parseMetricNumber(item.value)).filter((value) => value !== null);
  const max = values.length ? Math.max(...values, 1) : 1;
  return `
    <div class="metric-trend" aria-label="指标趋势">
      ${history
        .map((item) => {
          const value = parseMetricNumber(item.value);
          const height = value === null ? 18 : Math.max(18, Math.round((value / max) * 48));
          return `<span style="height:${height}px" title="${escapeHtml(item.date)} ${escapeHtml(item.value)}"></span>`;
        })
        .join("")}
    </div>
  `;
}

function renderMetricDetail(metric, isExpanded) {
  if (!isExpanded) return "";
  const detail = splitMetricObservation(metric.observation, metric.observable);
  const history = Array.isArray(metric.history) && metric.history.length
    ? metric.history
        .slice(-8)
        .map((item) => `<span>${escapeHtml(item.date || "未标日期")}：${escapeHtml(item.value || "未填")}</span>`)
        .join("")
    : "<span>暂无历史记录</span>";
  return `
    <div class="metric-detail-panel">
      <p><b>计算口径</b>${escapeHtml(detail.observation || "未维护计算口径")}</p>
      <p><b>可观测时间</b>${escapeHtml(detail.observable || "未明确")}</p>
      <p><b>当前/目标</b>${escapeHtml(metric.current || "待填")}${metric.target ? ` / ${escapeHtml(metric.target)}` : ""}</p>
      <div class="metric-history-list">${history}</div>
    </div>
  `;
}

function renderMetricTargetStack({ label, value, caption = "目标" }) {
  const text = String(value || "").trim();
  if (!text || text === "-") return "";
  return `
    <div class="metric-target-stack has-tip" data-tip="${escapeHtml(label)}">
      <small>${escapeHtml(caption)}</small>
      <strong>${escapeHtml(text)}</strong>
    </div>
  `;
}

function getMetricCardClass({ toneClass, statusClass, expanded, hasSide }) {
  return `metric-visual-card ${toneClass} ${statusClass} ${hasSide ? "has-side" : "is-full"} ${expanded ? "is-expanded" : ""}`;
}

function renderMetricVisualCopy({ metric, index, statusBadge }) {
  const metricName = escapeHtml(metric.name || `指标 ${index + 1}`);
  return `
    <div class="metric-visual-copy">
      <span class="metric-label-strip">${statusBadge}</span>
      <strong>${metricName}</strong>
    </div>
  `;
}

function renderMetricVisual(metric, index, project) {
  const status = getMetricTargetStatus(metric);
  const progress = getMetricProgress(metric);
  const hasTarget = status.hasTarget;
  const hasNumber = parseMetricNumber(metric.current) !== null;
  const hasTargetOnly = status.key === "goal";
  const toneClass = hasTarget ? "is-target" : hasNumber ? "is-number" : "is-qualitative";
  const statusClass = `is-status-${status.key}`;
  const metricKey = `${project.id}:${metric.id || index}`;
  const expanded = isExpandedKey(state.expandedMetricDetails, metricKey);
  const statusBadge = `<span class="metric-status-badge ${statusClass}">${escapeHtml(status.label)}</span>`;
  const targetDetail = buildMetricTargetDetail(metric);

  if (hasTargetOnly) {
    const side = renderMetricTargetStack({ label: targetDetail, value: metric.target || "待填目标" });
    const hasSide = Boolean(side);
    return `
      <article class="${getMetricCardClass({ toneClass: `${toneClass} is-target-only`, statusClass, expanded, hasSide })}" style="--project-color: ${project.color}" data-toggle-metric-detail="${escapeHtml(metricKey)}" role="button" tabindex="0">
        ${renderMetricVisualCopy({ metric, index, statusBadge })}
        ${side}
        ${renderMetricDetail(metric, expanded)}
      </article>
    `;
  }

  if (progress !== null) {
    return `
      <article class="metric-visual-card ${toneClass} ${statusClass} ${expanded ? "is-expanded" : ""}" style="--project-color: ${project.color}; --chart-angle: ${progress * 3.6}deg" data-toggle-metric-detail="${escapeHtml(metricKey)}" role="button" tabindex="0">
        ${renderMetricVisualCopy({ metric, index, statusBadge })}
        <div class="metric-hero-visual">
          <div class="metric-ring metric-ring-large metric-pie"><span>${progress}%</span></div>
          <small>${escapeHtml(status.label)}</small>
        </div>
        ${renderMetricDetail(metric, expanded)}
      </article>
    `;
  }

  const side = renderMetricTargetStack({
    label: targetDetail,
    value: metric.target || metric.current,
    caption: metric.target ? "目标" : "当前",
  });
  const hasSide = Boolean(side);
  return `
    <article class="${getMetricCardClass({ toneClass, statusClass, expanded, hasSide })}" style="--project-color: ${project.color}" data-toggle-metric-detail="${escapeHtml(metricKey)}" role="button" tabindex="0">
      ${renderMetricVisualCopy({ metric, index, statusBadge })}
      ${side}
      ${renderMetricDetail(metric, expanded)}
    </article>
  `;
}

function renderMilestoneStatusTag(milestone) {
  const status = milestone.status || "planned";
  const label = formatMilestoneStatusLabel(status);
  return `<span class="calendar-state ${status}">${escapeHtml(label)}</span>`;
}

function renderChangeBadge(milestone) {
  if (milestone.status !== "changed" && !milestone.changeNote) return "";
  const note = milestone.changeNote ? compactText(formatMilestoneChangeSummary(milestone.changeNote), 28) : "请补充变更原因";
  return `<small class="change-where">变更：${escapeHtml(note)}</small>`;
}

function renderReportProjectMetrics() {
  const project = getReportProject();
  const container = document.querySelector("#reportProjectMetrics");
  if (!container || !project) return;
  const metrics = getProjectMetricItems(project);
  const editableMetrics = state.metricEditMode ? ensureMetricDraft(project) : metrics;
  const saveMetricsKey = buildActionKey("save-metrics", project.id);
  const isSavingMetrics = isActionPending(state.pendingActions, saveMetricsKey);
  const editableMarkup = editableMetrics
    .map(
      (metric, index) => `
        <article class="metric-maintenance-row" data-metric-id="${metric.id}">
          <label>
            <span>指标名称</span>
            <input value="${escapeHtml(metric.name)}" data-metric-field="name" data-metric-id="${metric.id}" placeholder="例如：试点覆盖门店数" />
          </label>
          <label>
            <span>当前值</span>
            <input value="${escapeHtml(metric.current)}" data-metric-field="current" data-metric-id="${metric.id}" placeholder="例如：12家 / 55.5%" />
          </label>
          <label>
            <span>目标值</span>
            <input value="${escapeHtml(metric.target)}" data-metric-field="target" data-metric-id="${metric.id}" placeholder="无目标可留空" />
          </label>
          <label class="metric-note-field">
            <span>计算口径</span>
            <textarea data-metric-field="observation" data-metric-id="${metric.id}" placeholder="例如：已完成数量 / 计划总数">${escapeHtml(metric.observation)}</textarea>
          </label>
          <label>
            <span>可观测时间</span>
            <input value="${escapeHtml(metric.observable || "")}" data-metric-field="observable" data-metric-id="${metric.id}" placeholder="例如：2026/6/30" />
          </label>
          <div class="metric-row-actions">
            <button class="secondary-action compact-action" type="button" data-record-metric="${metric.id}">记录本期</button>
            <button class="ghost-danger" type="button" data-delete-metric="${metric.id}">删除</button>
          </div>
        </article>
      `
    )
    .join("");

  container.innerHTML = `
    <div class="metric-workbench-head">
      <strong>${metrics.length} 个指标</strong>
      <button class="tiny-action" type="button" id="metricEditToggle">${state.metricEditMode ? "收起维护" : "维护指标"}</button>
    </div>
    <div class="metric-visual-grid">
      ${metrics.map((metric, index) => renderMetricVisual(metric, index, project)).join("")}
    </div>
    <div class="metric-maintenance ${state.metricEditMode ? "is-open" : ""}">
      <div class="maintenance-toolbar">
        <span>指标维护</span>
        <div class="maintenance-actions">
          <button class="secondary-action" type="button" data-add-metric>新增指标</button>
          <button class="secondary-action" type="button" data-save-metrics${actionAttrs(saveMetricsKey)}>${isSavingMetrics ? "保存中..." : "保存指标"}</button>
        </div>
      </div>
      <div class="metric-maintenance-list">${editableMarkup}</div>
    </div>
  `;
}

function renderReportMilestoneRail() {
  const container = document.querySelector("#reportMilestoneRail");
  const project = getReportProject();
  if (!container || !project) return;
  const toggle = document.querySelector("#milestoneManageToggle");
  if (toggle) toggle.textContent = state.milestoneManageMode ? "取消" : "维护";
  const addButton = document.querySelector(".milestone-add-button");
  if (addButton) addButton.classList.toggle("is-visible", state.milestoneManageMode);
  const saveButton = document.querySelector(".milestone-save-button");
  const saveMilestonesKey = buildActionKey("save-milestones", project.id);
  const isSavingMilestones = isActionPending(state.pendingActions, saveMilestonesKey);
  if (saveButton) {
    saveButton.classList.toggle("is-visible", state.milestoneManageMode);
    saveButton.disabled = isSavingMilestones;
    saveButton.setAttribute("aria-busy", isSavingMilestones ? "true" : "false");
    saveButton.textContent = isSavingMilestones ? "保存中..." : "保存";
  }

  const activeMilestoneId = getReportMilestone(project)?.id;
  const allMilestones = state.milestoneManageMode ? ensureMilestoneDraft(project) : getReportMilestones(project);
  const milestoneState = getVisibleMilestones(allMilestones, {
    expanded: Boolean(state.expandedProjectMilestones[project.id]),
    limit: 8,
    pinnedId: activeMilestoneId,
  });
  const milestones = milestoneState.visible;
  if (!allMilestones.length) {
    container.innerHTML = `
      <div class="empty-state">暂无可维护里程碑</div>
      <button class="secondary-action" type="button" data-add-milestone>新增里程碑</button>
    `;
    return;
  }

  container.innerHTML =
    milestones
    .map((milestone, index) => {
      const windowInfo = getMilestoneWindow(project, milestone);
      const isActive = milestone.id === activeMilestoneId;
      const reportCount = getMilestoneSubmissionCount(project.id, milestone.id);
      const miniWeeks = Array.from({ length: windowInfo.weekCount }, (_, weekIndex) => {
        const week = weekIndex + 1;
        const hasReport = getWeekSubmission(project.id, week, milestone.id);
        const current = windowInfo.hasStarted && !windowInfo.hasEnded && week === windowInfo.currentWeek;
        return `<button class="mini-week ${hasReport ? "is-done" : ""} ${current ? "is-current" : ""}" type="button" data-report-milestone="${
          milestone.id
        }" data-milestone-week="${week}" aria-label="${escapeHtml(milestone.title)}第${week}周"></button>`;
      }).join("");

      return `
        <article class="milestone-bead ${isActive ? "is-active" : ""} ${state.milestoneManageMode ? "is-managing" : ""}">
          ${
            state.milestoneManageMode
              ? `<button class="milestone-delete-float" type="button" data-delete-milestone="${milestone.id}" aria-label="删除里程碑">删除</button>`
              : ""
          }
          <button class="milestone-bead-main" type="button" data-report-milestone="${milestone.id}">
            <span class="bead-dot">${escapeHtml(milestone.dateInfo ? `${milestone.dateInfo.month}/${milestone.dateInfo.day}` : "--")}</span>
            <span class="bead-copy">
              <b>${escapeHtml(milestone.title)}</b>
              <small>${escapeHtml(milestone.dateInfo?.label || "未标日期")} · ${
        milestoneStatusMap[milestone.status] || "计划中"
      } · ${reportCount} 条记录</small>
              ${milestone.status === "changed" || milestone.changeNote ? `<small class="change-note">变更：${escapeHtml(milestone.changeNote ? compactText(milestone.changeNote, 40) : "请补充变更位置或原因")}</small>` : ""}
            </span>
          </button>
          <div class="mini-week-strip">${miniWeeks}</div>
          ${
            state.milestoneManageMode
              ? `
                <div class="milestone-maintenance-row" data-edit-milestone="${milestone.id}">
                  <label>
                    <span>名称</span>
                    <input value="${escapeHtml(milestone.title)}" data-milestone-field="title" data-milestone-id="${milestone.id}" />
                  </label>
                  <label>
                    <span>日期</span>
                    <input type="date" value="${escapeHtml(milestone.dateInfo?.key || "")}" data-milestone-field="dateKey" data-milestone-id="${milestone.id}" />
                  </label>
                  <label>
                    <span>状态</span>
                    <select data-milestone-field="status" data-milestone-id="${milestone.id}">
                      ${Object.entries(editableMilestoneStatusMap)
                        .map(
                          ([key, label]) => `<option value="${key}" ${milestone.status === key ? "selected" : ""}>${label}</option>`
                        )
                        .join("")}
                    </select>
                  </label>
                  <label class="milestone-change-field">
                    <span>变更位置/原因</span>
                    <input value="${escapeHtml(milestone.changeNote || "")}" data-milestone-field="changeNote" data-milestone-id="${milestone.id}" placeholder="例如：日期由5/18调整至5/24，原因..." />
                  </label>
                </div>
              `
              : ""
          }
        </article>
      `;
    })
    .join("") +
    (milestoneState.hiddenCount
      ? `<button class="milestone-limit-action" type="button" data-toggle-report-milestones="${project.id}">展开其余 ${milestoneState.hiddenCount} 个节点</button>`
      : milestoneState.isExpanded && allMilestones.length > 8
        ? `<button class="milestone-limit-action" type="button" data-toggle-report-milestones="${project.id}">收起节点</button>`
        : "");
  scrollPendingMilestoneEditorIntoView(container);
}

function scrollPendingMilestoneEditorIntoView(container) {
  const milestoneId = state.pendingMilestoneScrollId;
  if (!milestoneId) return;
  state.pendingMilestoneScrollId = null;
  requestAnimationFrame(() => {
    const target = [...container.querySelectorAll("[data-edit-milestone]")]
      .find((item) => item.dataset.editMilestone === milestoneId);
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    target?.querySelector("input, textarea, select")?.focus({ preventScroll: true });
  });
}

function renderWeekTimeline() {
  const container = document.querySelector("#weekTimeline");
  const prompt = document.querySelector("#weekPrompt");
  const rangeLabel = document.querySelector("#weekRangeLabel");
  const snapshot = document.querySelector("#weekSnapshot");
  const focus = document.querySelector(".milestone-focus");
  const editToggle = document.querySelector("#milestoneEditToggle");
  const saveFocusedButton = document.querySelector("[data-save-focused-milestone]");
  const project = getReportProject();
  const milestone = getReportMilestone(project);
  if (!container || !prompt || !snapshot || !project || !milestone) return;

  if (focus) focus.classList.toggle("is-editing", state.milestoneEditMode);
  if (editToggle) editToggle.textContent = state.milestoneEditMode ? "收起" : "修改";
  const saveFocusedKey = buildActionKey("save-focused-milestone", project.id, milestone.id);
  const isSavingFocused = isActionPending(state.pendingActions, saveFocusedKey);
  if (saveFocusedButton) {
    saveFocusedButton.disabled = isSavingFocused;
    saveFocusedButton.setAttribute("aria-busy", isSavingFocused ? "true" : "false");
    saveFocusedButton.textContent = isSavingFocused ? "保存中..." : "保存里程碑";
  }

  const windowInfo = getMilestoneWindow(project, milestone);
  state.selectedWeek = Math.min(state.selectedWeek, windowInfo.weekCount);
  if (state.selectedWeek < 1) state.selectedWeek = windowInfo.currentWeek || 1;
  const selectedReport = getWeekSubmission(project.id, state.selectedWeek, milestone.id);
  const currentReport = getWeekSubmission(project.id, windowInfo.currentWeek, milestone.id);
  const weekSummary = getWeekRangeSummary({
    startKey: windowInfo.startKey,
    endKey: windowInfo.endKey,
    selectedWeek: state.selectedWeek,
  });
  if (rangeLabel) rangeLabel.textContent = `${weekSummary} · 节点周期 ${windowInfo.label}`;
  prompt.textContent = selectedReport
    ? `${milestone.title}`
    : state.selectedWeek === windowInfo.currentWeek && windowInfo.hasStarted
      ? `${milestone.title}`
      : `${milestone.title}`;

  container.innerHTML = Array.from({ length: windowInfo.weekCount }, (_, index) => index + 1).map((week) => {
    const hasReport = getWeekSubmission(project.id, week, milestone.id);
    let status = "future";
    if (hasReport) status = "done";
    else if (windowInfo.hasStarted && week < windowInfo.currentWeek) status = "missed";
    else if (windowInfo.hasStarted && !windowInfo.hasEnded && week === windowInfo.currentWeek) status = "current";
    const active = week === state.selectedWeek ? " is-active" : "";
    const title = hasReport ? "已填报" : status === "current" ? "当前节点待更新" : status === "missed" ? "可补报" : "未到周期";
    return `<button class="week-dot ${status}${active}" type="button" data-week="${week}" aria-label="第${week}周，${title}">${week}</button>`;
  }).join("");

  if (currentReport && state.selectedWeek !== windowInfo.currentWeek) {
    prompt.textContent += ` · 当前节点已由 ${currentReport.memberName} 更新`;
  }

  const requiredItems = [
    { label: "进展", done: Boolean(selectedReport?.progress) },
    { label: "风险", done: Boolean(selectedReport?.risk) },
  ];

  if (selectedReport) {
    snapshot.innerHTML = `
      <div>
        <strong>${escapeHtml(weekSummary)} · 记录</strong>
        <p>${escapeHtml(compactText(selectedReport.progress, 96))}</p>
      </div>
      <div class="week-checks">
        ${requiredItems
          .map((item) => `<span class="${item.done ? "is-done" : ""}">${item.done ? "已填" : "待补"} ${item.label}</span>`)
          .join("")}
      </div>
    `;
    return;
  }

  snapshot.innerHTML = `
    <div>
      <strong>${escapeHtml(weekSummary)} · 待维护</strong>
      <p>当前周进展会沉淀到这个里程碑下，点击左侧周节点可回看历史记录。</p>
    </div>
    <div class="week-checks">
      ${requiredItems.map((item) => `<span>${item.label}</span>`).join("")}
    </div>
  `;
}

function renderMemberWorkspace() {
  const profileText = document.querySelector("#memberProfileText");
  const reportPanel = document.querySelector("#memberReportPanel");
  reportPanel.classList.toggle("is-disabled", !memberProfile);

  if (memberProfile) {
    const project = projects.find((item) => item.id === memberProfile.projectId);
    const projectCount = memberProfile.isAdmin ? projects.length : getReportableProjects().length;
    profileText.textContent = `${memberProfile.name} · ${memberProfile.role} · 可维护项目 ${projectCount} 个 · 默认项目 ${project?.shortName || "未选择"}`;
  } else {
    profileText.textContent = "请先通过飞书登录，再进入项目维护";
  }
  renderReportMilestoneRail();
  renderReportProjectBrief();
  renderReportProjectMetrics();
  renderWeekTimeline();
  syncReportMilestoneFields();
  renderReportStatusPanel();

  const list = document.querySelector("#submissionList");
  const reportProject = getReportProject();
  const visibleSubmissions = getProjectReportHistory(submissions, reportProject?.id, { limit: 8 });
  if (!visibleSubmissions.length) {
    list.innerHTML = '<div class="empty-state">还没有填报记录</div>';
    return;
  }

  list.innerHTML = visibleSubmissions
    .map((item) => {
      const project = projects.find((projectItem) => projectItem.id === item.projectId);
      const deleteKey = buildActionKey("delete-report", item.id);
      const isDeleting = isActionPending(state.pendingActions, deleteKey);
      const submissionKey = item.id || `${item.projectId}:${item.week}:${item.milestoneId || "project"}`;
      const expanded = isExpandedKey(state.expandedSubmissionDetails, submissionKey);
      const deleteAction = memberProfile?.isAdmin && item.id
        ? `<button class="submission-delete" type="button" data-delete-report="${escapeHtml(item.id)}"${actionAttrs(deleteKey)}>${isDeleting ? "删除中..." : "删除"}</button>`
        : "";
      return `
        <article class="submission-item ${expanded ? "is-expanded" : ""}" data-toggle-submission-detail="${escapeHtml(submissionKey)}" role="button" tabindex="0">
          <header>
            <strong>第${escapeHtml(item.week || CURRENT_REPORT_WEEK)}周 · ${escapeHtml(project?.shortName || "未知项目")}</strong>
            <span>${escapeHtml(item.memberName)} · ${escapeHtml(item.memberRole)}</span>
          </header>
          <small>${escapeHtml(item.milestoneTitle || "未关联里程碑")}</small>
          <p>${escapeHtml(expanded ? item.progress || "暂无进展内容" : compactText(item.progress, 130))}</p>
          ${
            expanded
              ? `<div class="submission-detail">
                  <p><b>风险与诉求</b>${escapeHtml(item.risk || "暂无")}</p>
                  <p><b>里程碑状态</b>${escapeHtml(item.milestoneStatus || "planned")}${item.milestoneDate ? ` · ${escapeHtml(item.milestoneDate)}` : ""}</p>
                </div>`
              : ""
          }
          <footer>
            <small>${escapeHtml(new Date(item.updatedAt || item.createdAt).toLocaleString("zh-CN"))} · ${expanded ? "点击收起" : "点击查看详情"}</small>
            ${deleteAction}
          </footer>
        </article>
      `;
    })
    .join("");
}

function openMilestoneModal(projectId, milestoneId) {
  const project = projects.find((item) => item.id === projectId);
  const reportProject = getReportProject();
  const milestone = getMilestoneCalendarSource({
    projectId,
    reportProjectId: reportProject?.id,
    isManagingMilestones: state.milestoneManageMode,
    projectMilestones: project?.milestones,
    draftMilestones: draftStore.milestones[projectId],
  }).find((item) => item.id === milestoneId);
  if (!project || !milestone) return;

  state.selectedId = projectId;
  state.selectedMilestone = milestoneId;
  renderProjectList();
  renderDetail();
  renderMetrics();

  const reportKey = `${projectId}:${milestoneId}`;
  const reportPreview = getMilestoneReportPreview(submissions, {
    projectId,
    milestoneId,
    expanded: Boolean(state.expandedMilestoneReports[reportKey]),
    limit: 3,
  });
  const reportMarkup = reportPreview.reports.length
    ? reportPreview.reports
        .map(
          (report) => {
            const reportDetailKey = report.id || `${projectId}:${milestoneId}:${report.week || CURRENT_REPORT_WEEK}`;
            const expanded = isExpandedKey(state.expandedSubmissionDetails, `modal:${reportDetailKey}`);
            return `
            <article class="modal-report-item ${expanded ? "is-expanded" : ""}" data-toggle-modal-report-detail="${escapeHtml(reportDetailKey)}" role="button" tabindex="0">
              <header>
                <strong>第${escapeHtml(report.week || CURRENT_REPORT_WEEK)}周</strong>
                <span>${escapeHtml(report.memberName || "未记录成员")} · ${expanded ? "点击收起" : "点击查看详情"}</span>
              </header>
              <p>${escapeHtml(compactText(report.progress || "暂无进展内容", reportPreview.isExpanded ? 220 : 96))}</p>
              ${report.risk ? `<small>风险与诉求：${escapeHtml(compactText(report.risk, reportPreview.isExpanded ? 160 : 72))}</small>` : ""}
              ${
                expanded
                  ? `<div class="modal-report-detail">
                      <p><b>完整进展</b>${escapeHtml(report.progress || "暂无进展内容")}</p>
                      <p><b>风险与诉求</b>${escapeHtml(report.risk || "暂无")}</p>
                      <p><b>里程碑状态</b>${escapeHtml(formatMilestoneStatusLabel(report.milestoneStatus))}${report.milestoneDate ? ` · ${escapeHtml(report.milestoneDate)}` : ""}</p>
                      <p><b>提交时间</b>${escapeHtml(new Date(report.updatedAt || report.createdAt).toLocaleString("zh-CN"))}</p>
                    </div>`
                  : ""
              }
            </article>
          `;
          }
        )
        .join("")
    : '<p class="muted-text">该里程碑暂无周度维护记录</p>';
  const rawText = String(milestone.raw || "").trim();
  const rawMarkup = rawText && rawText !== milestone.title ? `<p>${escapeHtml(rawText)}</p>` : "";
  const changeNote = formatMilestoneChangeSummary(milestone.changeNote);
  document.querySelector("#milestoneModalContent").innerHTML = `
    <p class="modal-eyebrow">${escapeHtml(project.shortName)} · ${escapeHtml(project.businessLine || "未填业务线")} · ${escapeHtml(milestone.source)}</p>
    <h2 id="milestoneModalTitle">${escapeHtml(milestone.title)}</h2>
    <div class="modal-status-line">
      <span class="calendar-status ${milestone.status}">${escapeHtml(formatMilestoneStatusLabel(milestone.status))}</span>
      <span>${escapeHtml(milestone.dateInfo?.label || "未标日期")}</span>
      ${reportPreview.total ? `<span class="modal-update-chip">${reportPreview.total} 条周报更新</span>` : ""}
    </div>
    ${rawMarkup}
    ${changeNote ? `<p><strong>变更原因：</strong>${escapeHtml(changeNote)}</p>` : ""}
    <section class="modal-report-list">
      <div class="modal-section-head">
        <strong>周度维护</strong>
        <span>${reportPreview.total} 条</span>
      </div>
      ${reportMarkup}
      ${
        reportPreview.hiddenCount || reportPreview.isExpanded
          ? `<button class="tiny-action" type="button" data-toggle-modal-reports="${escapeHtml(reportKey)}">${reportPreview.isExpanded ? "收起" : `展开 ${reportPreview.hiddenCount} 条`}</button>`
          : ""
      }
    </section>
  `;
  const modal = document.querySelector("#milestoneModal");
  modal.dataset.projectId = projectId;
  modal.dataset.milestoneId = milestoneId;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function closeMilestoneModal() {
  const modal = document.querySelector("#milestoneModal");
  delete modal.dataset.projectId;
  delete modal.dataset.milestoneId;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
}

function getGovernanceItems() {
  const items = [];
  projects.forEach((project) => {
    const metrics = getProjectMetricItems(project);
    const metricNeedsWork =
      !metrics.length || metrics.some((metric) => !metric.name || !metric.current || (!metric.target && !metric.observation));
    if (project.established !== "是") {
      items.push({
        level: "high",
        type: "立项治理",
        project,
        title: "重点项目尚未正式立项",
        detail: "需要确认项目治理口径、资源归属与后续追踪方式。",
      });
    }
    if (metricNeedsWork) {
      items.push({
        level: "medium",
        type: "指标治理",
        project,
        title: "项目指标仍需结构化",
        detail: "建议补充指标名称、当前值、目标值、观测时间和后续提升动作。",
      });
    }
    if (!project.owner || project.owner === "未填写") {
      items.push({
        level: "medium",
        type: "责任人治理",
        project,
        title: "负责人信息缺失",
        detail: "项目清单需要明确唯一负责人，便于老板视角和 PMO 追踪。",
      });
    }
    if (!getCurrentWeekSubmission(project.id)) {
      const latest = getLatestProjectSubmission(project.id);
      items.push({
        level: "medium",
        type: "填报治理",
        project,
        title: "本周项目进展未更新",
        detail: latest
          ? `最近一次更新为第${latest.week || CURRENT_REPORT_WEEK}周，更新人 ${latest.memberName}`
          : "暂无成员填报记录，需提醒项目成员补充本周进展。",
      });
    }
    project.milestones.forEach((milestone) => {
      if (!milestone.dateInfo) {
        items.push({
          level: "low",
          type: "里程碑治理",
          project,
          title: "里程碑缺少明确日期",
          detail: milestone.title,
        });
      }
      if (milestone.status === "overdue") {
        items.push({
          level: "high",
          type: "逾期治理",
          project,
          title: "存在已过计划日的里程碑",
          detail: `${milestone.dateInfo?.label || "未标日期"} · ${milestone.title}`,
        });
      }
      if (["changed", "risk"].includes(milestone.status) && !milestone.changeNote) {
        items.push({
          level: "medium",
          type: "变更治理",
          project,
          title: "里程碑变更缺少原因",
          detail: `${milestone.dateInfo?.label || "未标日期"} · ${milestone.title}`,
        });
      }
    });
    project.risks.filter((risk) => risk.status !== "closed").forEach((risk) => {
      items.push({
        level: risk.level === "high" ? "high" : "medium",
        type: "风险治理",
        project,
        title: risk.title,
        detail: risk.detail,
      });
      if (!risk.owner) {
        items.push({
          level: "medium",
          type: "风险治理",
          project,
          title: "风险缺少责任人",
          detail: risk.title,
        });
      }
      if (!risk.dueDate) {
        items.push({
          level: "medium",
          type: "风险治理",
          project,
          title: "风险缺少计划解决时间",
          detail: risk.title,
        });
      }
    });
  });
  return items
    .map((item) => ({
      ...item,
      itemKey: getGovernanceItemKey(item),
      resolution: getGovernanceResolution(item),
    }))
    .sort((a, b) => {
      const statusRank = { todo: 0, doing: 1, done: 2 };
      const levelRank = { high: 0, medium: 1, low: 2 };
      if (statusRank[a.resolution.status] !== statusRank[b.resolution.status]) {
        return statusRank[a.resolution.status] - statusRank[b.resolution.status];
      }
      return levelRank[a.level] - levelRank[b.level];
    });
}

function getFilteredGovernanceItems(items) {
  return items.filter((item) => {
    const levelMatched = state.governanceLevel === "all" || item.level === state.governanceLevel;
    const typeMatched = state.governanceType === "all" || item.type === state.governanceType;
    return levelMatched && typeMatched;
  });
}

function renderGovernance() {
  const summary = document.querySelector("#governanceSummary");
  const list = document.querySelector("#governanceList");
  const levelTabs = document.querySelector("#governanceLevelTabs");
  const typeFilter = document.querySelector("#governanceTypeFilter");
  const listMeta = document.querySelector("#governanceListMeta");
  if (!summary || !list) return;

  const items = getGovernanceItems();
  const filteredItems = getFilteredGovernanceItems(items);
  const highCount = items.filter((item) => item.level === "high").length;
  const metricCount = items.filter((item) => item.type === "指标治理").length;
  const overdueCount = items.filter((item) => item.type === "逾期治理").length;
  const missingDateCount = items.filter((item) => item.type === "里程碑治理").length;
  const missingUpdateCount = items.filter((item) => item.type === "填报治理").length;
  const resolvedCount = items.filter((item) => item.resolution.status === "done").length;
  summary.innerHTML = `
    <article><span>高优先级</span><strong>${highCount}</strong></article>
    <article><span>指标待补</span><strong>${metricCount}</strong></article>
    <article><span>逾期节点</span><strong>${overdueCount}</strong></article>
    <article><span>缺日期</span><strong>${missingDateCount}</strong></article>
    <article><span>本周未更</span><strong>${missingUpdateCount}</strong></article>
  `;

  if (levelTabs) {
    const levelOptions = [
      { key: "all", label: "全部", count: items.length },
      { key: "high", label: "高优先", count: highCount },
      { key: "medium", label: "中优先", count: items.filter((item) => item.level === "medium").length },
      { key: "low", label: "低优先", count: items.filter((item) => item.level === "low").length },
    ];
    levelTabs.innerHTML = levelOptions
      .map(
        (option) =>
          `<button class="segment-button governance-segment ${state.governanceLevel === option.key ? "is-active" : ""}" type="button" data-governance-level="${option.key}">${option.label}<span>${option.count}</span></button>`
      )
      .join("");
  }

  if (typeFilter) {
    const types = Array.from(new Set(items.map((item) => item.type))).sort((a, b) => a.localeCompare(b, "zh-CN"));
    if (state.governanceType !== "all" && !types.includes(state.governanceType)) state.governanceType = "all";
    typeFilter.innerHTML = [
      `<option value="all">全部类型</option>`,
      ...types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`),
    ].join("");
    typeFilter.value = state.governanceType;
  }

  if (listMeta) {
    listMeta.textContent = `当前显示 ${filteredItems.length} / ${items.length} 项，已处理 ${resolvedCount} 项`;
  }

  if (!items.length) {
    list.innerHTML = '<div class="empty-state">当前没有需要巡查跟进的事项</div>';
    return;
  }

  if (!filteredItems.length) {
    list.innerHTML = '<div class="empty-state">当前筛选条件下没有巡查事项，可切换优先级或类型查看</div>';
    return;
  }

  list.innerHTML = filteredItems
    .map(
      (item) => `
        <article class="governance-item ${item.level} governance-status-${item.resolution.status}">
          <button class="governance-main" type="button" data-governance-project="${item.project.id}">
            <span class="governance-level ${item.level}">${item.level === "high" ? "高" : item.level === "medium" ? "中" : "低"}</span>
            <span class="governance-copy">
              <b>${escapeHtml(item.project.shortName)} · ${escapeHtml(item.type)}</b>
              <strong>${escapeHtml(item.title)}</strong>
              <small>${escapeHtml(compactText(item.detail, 120))}</small>
              <em>
                ${escapeHtml(item.project.businessLine || "未填业务线")} · 项目负责人 ${escapeHtml(item.project.owner || "未填写")}
                <span class="governance-resolution-tag ${item.resolution.status}">${
                  item.resolution.status === "done" ? "已处理" : item.resolution.status === "doing" ? "处理中" : "待跟进"
                }</span>
              </em>
            </span>
          </button>
          <div class="governance-inline-fields">
            <select data-governance-field="status" data-governance-key="${item.itemKey}">
              <option value="todo" ${item.resolution.status === "todo" ? "selected" : ""}>待跟进</option>
              <option value="doing" ${item.resolution.status === "doing" ? "selected" : ""}>处理中</option>
              <option value="done" ${item.resolution.status === "done" ? "selected" : ""}>已处理</option>
            </select>
            <input value="${escapeHtml(item.resolution.owner)}" data-governance-field="owner" data-governance-key="${item.itemKey}" placeholder="责任人" />
          </div>
          <div class="governance-actions">
            <button type="button" data-governance-project="${item.project.id}">看详情</button>
            <button type="button" data-governance-report="${item.project.id}">去查看</button>
          </div>
        </article>
      `
    )
    .join("");
}

function render() {
  renderToday();
  renderViewSwitch();
  renderBusinessLineFilter();
  renderSummary();
  renderDataHealth();
  renderAttention();
  renderFilters();
  renderProjectList();
  renderCalendar();
  renderDetail();
  renderRisks();
  renderMetrics();
  renderMetricDashboard();
  renderProjectSelects();
  renderAuthCenter();
  renderChatPickerModal();
  renderUserEditModal();
  renderMemberWorkspace();
  renderGovernance();
}

function openProjectMaintenance(projectId) {
  const target = resolveProjectMaintenanceTarget(projects, memberProfile, projectId);
  if (!target.ok) {
    state.saveNotice = "你没有该项目的维护权限。";
    return;
  }
  state.selectedId = target.projectId;
  state.currentView = "report";
  resetAllDrafts();
  resetReportEditorState();
  if (memberProfile) memberProfile.projectId = target.projectId;
  window.location.hash = buildProjectMaintenanceHash(target.projectId);
  render();
  const select = document.querySelector("#reportProjectSelect");
  if (select) select.value = target.projectId;
  const milestone = getReportMilestone(getReportProject());
  state.selectedWeek = milestone ? getMilestoneWindow(getReportProject(), milestone).currentWeek || 1 : CURRENT_REPORT_WEEK;
  syncReportMilestoneFields();
  renderMemberWorkspace();
  document.querySelector("#memberReportPanel")?.scrollIntoView({ block: "start" });
}

document.addEventListener("click", async (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    const nextView = viewButton.dataset.view;
    state.currentView = getAllowedView(nextView);
    if (!memberProfile && nextView !== "register") authState.error = "请先通过飞书登录后再进入系统。";
    window.location.hash = getViewHash(state.currentView);
    render();
    return;
  }

  const feishuLoginButton = event.target.closest("[data-feishu-login]");
  if (feishuLoginButton) {
    window.location.href = "/api/auth/feishu/login?redirect=" + encodeURIComponent("/");
    return;
  }

  const logoutButton = event.target.closest("[data-logout]");
  if (logoutButton) {
    apiRequest("/api/auth/logout", { method: "POST" })
      .catch(() => null)
      .finally(() => {
        memberProfile = null;
        state.identityManageOpen = false;
        authState.users = [];
        authState.error = "";
        state.currentView = "register";
        window.location.hash = getViewHash(state.currentView);
        loadCurrentUser()
          .catch(() => null)
          .finally(() => render());
      });
    return;
  }

  const refreshUsersButton = event.target.closest("[data-refresh-users]");
  if (refreshUsersButton) {
    authState.usersRefreshing = true;
    renderAuthCenter();
    loadRoleBindings()
      .then(() => {
        authState.bindingError = "";
        authState.usersRefreshing = false;
        renderAuthCenter();
      })
      .catch((error) => {
        authState.bindingError = error.message;
        authState.usersRefreshing = false;
        renderAuthCenter();
      });
    return;
  }

  const identityManagementButton = event.target.closest("[data-toggle-identity-management]");
  if (identityManagementButton) {
    state.identityManageOpen = !state.identityManageOpen;
    renderAuthCenter();
    return;
  }

  const toggleProjectGroupButton = event.target.closest("[data-toggle-project-group]");
  if (toggleProjectGroupButton) {
    const groupId = toggleProjectGroupButton.dataset.toggleProjectGroup;
    const isExpanded = state.expandedProjectGroups[groupId] !== false;
    state.expandedProjectGroups[groupId] = !isExpanded;
    renderAuthCenter();
    return;
  }

  const toggleChatMembersButton = event.target.closest("[data-toggle-chat-members]");
  if (toggleChatMembersButton) {
    const groupId = toggleChatMembersButton.dataset.toggleChatMembers;
    state.expandedChatMembers[groupId] = !state.expandedChatMembers[groupId];
    if (state.chatPickerOpen && groupId.startsWith("chat:")) renderChatPickerModal();
    else renderAuthCenter();
    return;
  }

  const openUserEditButton = event.target.closest("[data-open-user-edit]");
  if (openUserEditButton) {
    state.userEditTargetId = openUserEditButton.dataset.openUserEdit;
    state.userEditModalOpen = true;
    renderUserEditModal();
    return;
  }

  if (event.target.closest("[data-close-user-edit]") || event.target.id === "userEditModal") {
    state.userEditModalOpen = false;
    state.userEditTargetId = null;
    renderUserEditModal();
    return;
  }

  const saveUserEditButton = event.target.closest("[data-save-user-edit]");
  if (saveUserEditButton) {
    const userId = saveUserEditButton.dataset.saveUserEdit;
    const actionKey = buildActionKey("save-user-edit", userId);
    if (!beginAction(actionKey)) return;
    const role = document.querySelector(`[data-edit-user-role="${userId}"]`)?.value || "MEMBER";
    const defaultProjectId = document.querySelector(`[data-edit-user-project="${userId}"]`)?.value || "";
    renderUserEditModal();
    saveRoleBinding(userId, role, defaultProjectId)
      .then(() => {
        authState.bindingError = "";
        state.userEditModalOpen = false;
        state.userEditTargetId = null;
        render();
      })
      .catch((error) => {
        authState.bindingError = error.message;
        render();
      })
      .finally(() => {
        finishAction(actionKey);
        renderUserEditModal();
      });
    return;
  }

  const createProjectButton = event.target.closest("[data-create-project]");
  if (createProjectButton) {
    const draft = state.projectCreateDraft;
    if (!String(draft.name || draft.shortName || "").trim()) {
      authState.bindingError = "请先填写项目名称。";
      renderAuthCenter();
      return;
    }
    const actionKey = buildActionKey("create-project");
    if (!beginAction(actionKey)) return;
    createProjectButton.disabled = true;
    createProjectRecord(draft)
      .then(() => loadBootstrapData())
      .then(() => loadRoleBindings())
      .then(() => {
        state.projectCreateDraft = { name: "", shortName: "", businessLine: "" };
        authState.bindingError = "项目已新增，可继续绑定群聊并同步成员。";
        render();
      })
      .catch((error) => {
        authState.bindingError = error.message;
        renderAuthCenter();
      })
      .finally(() => {
        finishAction(actionKey);
      });
    return;
  }

  const deleteProjectButton = event.target.closest("[data-delete-project]");
  if (deleteProjectButton) {
    const projectId = deleteProjectButton.dataset.deleteProject;
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    if (!confirm(`确认删除项目「${project.shortName}」？该操作会同步删除该项目的群成员绑定、里程碑、指标和填报记录。`)) return;
    const actionKey = buildActionKey("delete-project", projectId);
    if (!beginAction(actionKey)) return;
    deleteProjectRecord(projectId)
      .then(() => loadBootstrapData())
      .then(() => loadRoleBindings())
      .then(() => {
        resetAllDrafts();
        authState.bindingError = "项目已删除，相关列表已刷新。";
        render();
      })
      .catch((error) => {
        authState.bindingError = error.message;
        renderAuthCenter();
      })
      .finally(() => {
        finishAction(actionKey);
      });
    return;
  }

  const saveProjectChatButton = event.target.closest("[data-save-project-chat]");
  if (saveProjectChatButton) {
    const projectId = saveProjectChatButton.dataset.saveProjectChat;
    const chatId = document.querySelector(`[data-project-chat-id="${projectId}"]`)?.value || "";
    saveProjectChatBinding(projectId, chatId)
      .then(() => {
        const project = projects.find((item) => item.id === projectId);
        if (project) project.feishuChatId = chatId;
        authState.bindingError = "项目群聊已保存。";
        renderAuthCenter();
      })
      .catch((error) => {
        authState.bindingError = error.message;
        renderAuthCenter();
      });
    return;
  }

  const openChatPickerButton = event.target.closest("[data-open-chat-picker]");
  if (openChatPickerButton) {
    state.chatPickerProjectId = openChatPickerButton.dataset.openChatPicker;
    state.chatPickerOpen = true;
    state.chatSearch = "";
    if (!authState.chats.length) {
      loadFeishuChats()
        .catch((error) => {
          authState.bindingError = error.message;
        })
        .finally(() => render());
    } else {
      render();
    }
    return;
  }

  if (event.target.closest("[data-close-chat-picker]") || event.target.id === "chatPickerModal") {
    state.chatPickerOpen = false;
    renderChatPickerModal();
    return;
  }

  const refreshChatListButton = event.target.closest("[data-refresh-chat-list]");
  if (refreshChatListButton) {
    authState.chatsRefreshing = true;
    renderChatPickerModal();
    syncMyFeishuChats()
      .then((payload) => {
        if (!payload) { authState.bindingError = "群聊列表刷新失败，请检查服务状态。"; return; }
        const errorTip = payload.errorCount ? `，${payload.errorCount} 个群聊成员读取失败` : "";
        const memberTip = payload.membersSynced
          ? `、${payload.memberCount || 0} 条成员记录${errorTip}`
          : "，选择项目群聊后再同步该群成员";
        authState.bindingError = `群聊列表已刷新：${payload.chatCount || 0} 个群聊${memberTip}。`;
        authState.chatSyncErrors = Array.isArray(payload.errors) ? payload.errors : [];
        return loadFeishuChats();
      })
      .catch((error) => {
        authState.bindingError = error.message;
      })
      .finally(() => {
        authState.chatsRefreshing = false;
        render();
      });
    return;
  }

  const pickChatButton = event.target.closest("[data-pick-chat]");
  if (pickChatButton) {
    const projectId = state.chatPickerProjectId;
    const chatId = pickChatButton.dataset.pickChat;
    const actionKey = buildActionKey("pick-chat", projectId, chatId);
    if (!beginAction(actionKey)) return;
    renderChatPickerModal();
    saveProjectChatBinding(projectId, chatId)
      .then(() => syncProjectChatMembers(projectId, chatId))
      .then((payload) => {
        const project = projects.find((item) => item.id === projectId);
        if (project) project.feishuChatId = payload.chatId || chatId;
        authState.chats = mergeChatMembers(authState.chats, payload.chatId || chatId, payload.members || []);
        authState.bindingError = `已绑定群聊。${formatProjectMemberSyncMessage(payload)}`;
        state.chatPickerOpen = false;
        render();
      })
      .catch((error) => {
        authState.bindingError = error.message;
        render();
      })
      .finally(() => {
        finishAction(actionKey);
        renderChatPickerModal();
      });
    return;
  }

  const syncMyFeishuChatsButton = event.target.closest("[data-sync-my-feishu-chats]");
  if (syncMyFeishuChatsButton) {
    authState.chatSyncErrors = [];
    authState.chatSyncing = true;
    renderAuthCenter();
    syncMyFeishuChats()
      .then((payload) => {
        if (!payload) { authState.bindingError = "群聊同步失败，请检查飞书授权和网络状态。"; return; }
        const errorTip = payload.errorCount ? `，${payload.errorCount} 个群聊成员读取失败，可先绑定群聊后再排查权限` : "";
        const memberTip = payload.membersSynced
          ? `、${payload.memberCount || 0} 条成员记录${errorTip}`
          : "，选择项目群聊后再同步该群成员";
        authState.bindingError = `已写入 ${payload.chatCount || 0} 个群聊${memberTip}。`;
        authState.chatSyncErrors = Array.isArray(payload.errors) ? payload.errors : [];
        return loadFeishuChats();
      })
      .then(() => loadRoleBindings())
      .then(() => {
        authState.chatSyncing = false;
        renderAuthCenter();
      })
      .catch((error) => {
        authState.bindingError = error.message;
        authState.chatSyncing = false;
        renderAuthCenter();
      });
    return;
  }

  const syncProjectChatButton = event.target.closest("[data-sync-project-chat]");
  if (syncProjectChatButton) {
    const projectId = syncProjectChatButton.dataset.syncProjectChat;
    const actionKey = buildActionKey("sync-project-chat", projectId);
    if (!beginAction(actionKey)) return;
    const chatId = document.querySelector(`[data-project-chat-id="${projectId}"]`)?.value || "";
    renderAuthCenter();
    syncProjectChatMembers(projectId, chatId)
      .then((payload) => {
        if (!payload) { authState.bindingError = "群成员同步失败，请重试。"; return; }
        const project = projects.find((item) => item.id === projectId);
        if (project) project.feishuChatId = payload.chatId || chatId;
        authState.chats = mergeChatMembers(authState.chats, payload.chatId || chatId, payload.members || []);
        authState.bindingError = formatProjectMemberSyncMessage(payload);
        return loadRoleBindings();
      })
      .then(() => renderAuthCenter())
      .catch((error) => {
        authState.bindingError = error.message;
        renderAuthCenter();
      })
      .finally(() => {
        finishAction(actionKey);
        renderAuthCenter();
      });
    return;
  }

  const monthButton = event.target.closest("[data-month-shift]");
  if (monthButton) {
    shiftCalendarMonth(Number(monthButton.dataset.monthShift));
    renderSummary();
    renderDataHealth();
    renderAttention();
    renderCalendar();
    return;
  }

  const calendarDayButton = event.target.closest("[data-calendar-day]");
  if (calendarDayButton) {
    const dayKey = calendarDayButton.dataset.calendarDay;
    state.expandedCalendarDays[dayKey] = !state.expandedCalendarDays[dayKey];
    renderCalendar();
    return;
  }

  const calendarProjectButton = event.target.closest("[data-calendar-project]");
  if (calendarProjectButton) {
    state.calendarProject = calendarProjectButton.dataset.calendarProject;
    renderCalendar();
    return;
  }

  const detailTab = event.target.closest("[data-detail-tab]");
  if (detailTab) {
    state.detailTab = detailTab.dataset.detailTab;
    renderDetail();
    return;
  }

  const detailMilestoneToggle = event.target.closest("[data-toggle-detail-milestones]");
  if (detailMilestoneToggle) {
    const projectId = detailMilestoneToggle.dataset.toggleDetailMilestones;
    state.expandedProjectMilestones[projectId] = !state.expandedProjectMilestones[projectId];
    renderDetail();
    return;
  }

  const reportMilestoneToggle = event.target.closest("[data-toggle-report-milestones]");
  if (reportMilestoneToggle) {
    const projectId = reportMilestoneToggle.dataset.toggleReportMilestones;
    state.expandedProjectMilestones[projectId] = !state.expandedProjectMilestones[projectId];
    preserveScrollPosition(() => renderReportMilestoneRail());
    return;
  }

  const deleteReportButton = event.target.closest("[data-delete-report]");
  if (deleteReportButton) {
    if (!memberProfile?.isAdmin) return;
    const reportId = deleteReportButton.dataset.deleteReport;
    const actionKey = buildActionKey("delete-report", reportId);
    if (!beginAction(actionKey)) return;
    const report = submissions.find((item) => item.id === reportId);
    const label = report ? `第${report.week || CURRENT_REPORT_WEEK}周 ${report.memberName || ""} 的填报` : "这条填报";
    if (!window.confirm(`确认删除${label}？删除后不可恢复。`)) {
      finishAction(actionKey);
      renderMemberWorkspace();
      return;
    }
    deleteReportButton.disabled = true;
    state.saveNotice = "正在删除填报记录...";
    renderMemberWorkspace();
    try {
      await deleteWeeklyReport(reportId);
      submissions = submissions.filter((item) => item.id !== reportId);
      await loadWeeklyReports();
      state.saveNotice = "填报记录已删除。";
      renderMemberWorkspace();
      renderDetail();
      renderRisks();
      renderProjectList();
      renderGovernance();
    } catch (error) {
      state.saveNotice = error.message || "填报删除失败，请稍后重试";
      renderMemberWorkspace();
    } finally {
      finishAction(actionKey);
      renderMemberWorkspace();
    }
    return;
  }

  const metricEditToggle = event.target.closest("#metricEditToggle");
  if (metricEditToggle) {
    const project = getReportProject();
    if (!state.metricEditMode) ensureMetricDraft(project);
    else resetMetricDraft(project.id);
    state.metricEditMode = !state.metricEditMode;
    renderReportProjectMetrics();
    return;
  }

  const metricDetailToggle = event.target.closest("[data-toggle-metric-detail]");
  if (metricDetailToggle) {
    state.expandedMetricDetails = toggleExpandedKey(state.expandedMetricDetails, metricDetailToggle.dataset.toggleMetricDetail);
    renderReportProjectMetrics();
    return;
  }

  const submissionDetailToggle = event.target.closest("[data-toggle-submission-detail]");
  if (submissionDetailToggle && !event.target.closest("[data-delete-report]")) {
    state.expandedSubmissionDetails = toggleExpandedKey(
      state.expandedSubmissionDetails,
      submissionDetailToggle.dataset.toggleSubmissionDetail
    );
    renderMemberWorkspace();
    return;
  }

  const briefEditToggle = event.target.closest("#briefEditToggle");
  if (briefEditToggle) {
    const project = getReportProject();
    if (!state.briefEditMode) ensureBriefDraft(project);
    else resetBriefDraft(project.id);
    state.briefEditMode = !state.briefEditMode;
    renderReportProjectBrief();
    return;
  }

  const saveBriefButton = event.target.closest("[data-save-brief]");
  if (saveBriefButton) {
    const project = getReportProject();
    const actionKey = buildActionKey("save-brief", project?.id);
    if (!beginAction(actionKey)) return;
    const brief = ensureBriefDraft(project);
    state.saveNotice = "正在保存项目概览...";
    renderMemberWorkspace();
    try {
      const payload = await saveProjectBrief(project, brief);
      applyProjectBrief(project, payload?.brief || brief);
      resetBriefDraft(project.id);
      state.briefEditMode = false;
      state.saveNotice = "项目概览已保存。";
    } catch (error) {
      state.saveNotice = formatUserFacingError(error, "项目概览保存失败，请稍后重试");
    } finally {
      finishAction(actionKey);
    }
    renderMemberWorkspace();
    renderProjectList();
    renderDetail();
    renderGovernance();
    return;
  }

  const addMetric = event.target.closest("[data-add-metric]");
  if (addMetric) {
    const project = getReportProject();
    const metrics = ensureMetricDraft(project);
    metrics.push({
      id: uid(`${project.id}-metric`),
      name: "新增指标",
      current: "",
      target: "",
      observation: "",
      observable: "",
    });
    state.metricEditMode = true;
    renderReportProjectMetrics();
    return;
  }

  const deleteMetric = event.target.closest("[data-delete-metric]");
  if (deleteMetric) {
    const project = getReportProject();
    const metrics = ensureMetricDraft(project).filter((metric) => metric.id !== deleteMetric.dataset.deleteMetric);
    draftStore.metrics[project.id] = metrics;
    renderReportProjectMetrics();
    return;
  }

  const recordMetric = event.target.closest("[data-record-metric]");
  if (recordMetric) {
    const project = getReportProject();
    const todayKey = formatDateKey(TODAY.getFullYear(), TODAY.getMonth() + 1, TODAY.getDate());
    const metrics = ensureMetricDraft(project).map((metric) => {
      if (metric.id !== recordMetric.dataset.recordMetric) return metric;
      const history = (metric.history || []).filter((item) => item.date !== todayKey);
      return {
        ...metric,
        history: [...history, { date: todayKey, value: metric.current || "待填" }].slice(-8),
      };
    });
    draftStore.metrics[project.id] = metrics;
    renderReportProjectMetrics();
    return;
  }

  const saveMetricsButton = event.target.closest("[data-save-metrics]");
  if (saveMetricsButton) {
    const project = getReportProject();
    const actionKey = buildActionKey("save-metrics", project?.id);
    if (!beginAction(actionKey)) return;
    const metricDraft = ensureMetricDraft(project);
    state.saveNotice = "正在保存项目指标...";
    renderReportStatusPanel();
    renderReportProjectMetrics();
    saveProjectMetrics(project, metricDraft)
      .then((payload) => {
        if (payload?.projectState) applyProjectReportState(payload.projectState);
        else setProjectMetricItems(project, metricDraft);
        resetMetricDraft(project.id);
        state.metricEditMode = false;
        state.saveNotice = "项目指标已保存。";
      })
      .catch((error) => {
        state.saveNotice = formatUserFacingError(error, "项目指标保存失败，请稍后重试");
      })
      .finally(() => {
        finishAction(actionKey);
        renderReportProjectMetrics();
        renderDetail();
        renderProjectList();
        renderGovernance();
        renderReportStatusPanel();
      });
    return;
  }

  const milestoneManageToggle = event.target.closest("#milestoneManageToggle");
  if (milestoneManageToggle) {
    const project = getReportProject();
    if (!state.milestoneManageMode) {
      ensureMilestoneDraft(project);
      const selectedMilestoneId = state.selectedMilestone || state.selectedReportMilestoneId;
      const target = getReportMilestones(project).find((milestone) => milestone.id === selectedMilestoneId);
      if (target) {
        state.selectedReportMilestoneId = target.id;
        state.pendingMilestoneScrollId = target.id;
      }
    } else {
      resetMilestoneDraft(project.id);
      state.pendingMilestoneScrollId = null;
    }
    state.milestoneManageMode = !state.milestoneManageMode;
    preserveScrollPosition(() => renderReportMilestoneRail());
    return;
  }

  const addMilestone = event.target.closest("[data-add-milestone]");
  if (addMilestone) {
    const project = getReportProject();
    const milestones = ensureMilestoneDraft(project);
    const dateKey = formatDateKey(TODAY.getFullYear(), TODAY.getMonth() + 1, TODAY.getDate());
    const nextMilestone = normalizeMilestone(project, {
      id: uid(`${project.id}-m`),
      title: "新增里程碑",
      dateKey,
      status: "planned",
      source: "项目维护",
    });
    milestones.push(nextMilestone);
    state.selectedReportMilestoneId = nextMilestone.id;
    state.pendingMilestoneScrollId = nextMilestone.id;
    state.milestoneManageMode = true;
    refreshMilestoneMaintenanceViews();
    return;
  }

  const deleteMilestone = event.target.closest("[data-delete-milestone]");
  if (deleteMilestone) {
    const project = getReportProject();
    const milestones = ensureMilestoneDraft(project).filter((milestone) => milestone.id !== deleteMilestone.dataset.deleteMilestone);
    draftStore.milestones[project.id] = milestones;
    state.selectedReportMilestoneId = milestones[0]?.id || null;
    refreshMilestoneMaintenanceViews();
    return;
  }

  const saveMilestonesButton = event.target.closest("[data-save-milestones]");
  if (saveMilestonesButton) {
    const project = getReportProject();
    const actionKey = buildActionKey("save-milestones", project?.id);
    if (!beginAction(actionKey)) return;
    const milestoneDraft = ensureMilestoneDraft(project);
    state.saveNotice = "正在保存项目里程碑...";
    renderReportStatusPanel();
    renderReportMilestoneRail();
    saveProjectMilestones(project, milestoneDraft)
      .then((payload) => {
        if (payload?.projectState) applyProjectReportState(payload.projectState);
        else setProjectMilestones(project, milestoneDraft);
        resetMilestoneDraft(project.id);
        state.milestoneManageMode = false;
        state.saveNotice = "项目里程碑已保存。";
      })
      .catch((error) => {
        state.saveNotice = error.message;
      })
      .finally(() => {
        finishAction(actionKey);
        refreshMilestoneMaintenanceViews();
      });
    return;
  }

  const milestoneEditToggle = event.target.closest("#milestoneEditToggle");
  if (milestoneEditToggle) {
    state.milestoneEditMode = !state.milestoneEditMode;
    renderWeekTimeline();
    renderReportStatusPanel();
    return;
  }

  const saveFocusedMilestone = event.target.closest("[data-save-focused-milestone]");
  if (saveFocusedMilestone) {
    const form = document.querySelector("#memberReportForm");
    const project = getReportProject();
    const milestone = getReportMilestone(project);
    if (!form || !project || !milestone) return;
    const actionKey = buildActionKey("save-focused-milestone", project.id, milestone.id);
    if (!beginAction(actionKey)) return;
    const nextTitle = String(form.elements.milestoneTitle.value || milestone.title).trim();
    const nextDate = String(form.elements.milestoneDate.value || milestone.dateInfo?.key || "").trim();
    const nextStatus = editableMilestoneStatusMap[form.elements.milestoneStatus.value] ? form.elements.milestoneStatus.value : "planned";
    const milestones = replaceFocusedMilestone(getReportMilestones(project), {
      milestoneId: milestone.id,
      patch: buildFocusedMilestonePatch(
        {
          title: nextTitle,
          dateKey: nextDate,
          status: nextStatus,
        },
        serializeMilestone(milestone)
      ),
    }).map((item, index) => normalizeMilestone(project, item, index));
    state.saveNotice = "正在保存项目里程碑...";
    renderReportStatusPanel();
    try {
      const payload = await saveProjectMilestones(project, milestones);
      if (payload?.projectState) applyProjectReportState(payload.projectState);
      else setProjectMilestones(project, milestones);
      state.milestoneEditMode = false;
      state.saveNotice = "项目里程碑已保存。";
      syncReportMilestoneFields();
      renderReportMilestoneRail();
      renderWeekTimeline();
      renderReportProjectBrief();
      renderCalendar();
      renderDetail();
      renderReportStatusPanel();
      renderSummary();
      renderDataHealth();
    } catch (error) {
      state.saveNotice = error.message;
      renderReportStatusPanel();
    } finally {
      finishAction(actionKey);
    }
    return;
  }

  const reportMilestoneButton = event.target.closest("[data-report-milestone]");
  if (reportMilestoneButton) {
    selectReportMilestone(reportMilestoneButton.dataset.reportMilestone, reportMilestoneButton.dataset.milestoneWeek);
    return;
  }

  const weekButton = event.target.closest("[data-week]");
  if (weekButton) {
    state.selectedWeek = Number(weekButton.dataset.week);
    state.saveNotice = "";
    renderWeekTimeline();
    renderReportProjectBrief();
    renderReportStatusPanel();
    return;
  }

  const riskToggle = event.target.closest("#riskToggleButton");
  if (riskToggle) {
    state.risksExpanded = !state.risksExpanded;
    renderRisks();
    return;
  }

  const filterButton = event.target.closest("[data-filter]");
  if (filterButton) {
    state.filter = filterButton.dataset.filter;
    render();
    return;
  }

  const governanceLevelButton = event.target.closest("[data-governance-level]");
  if (governanceLevelButton) {
    state.governanceLevel = governanceLevelButton.dataset.governanceLevel;
    renderGovernance();
    return;
  }

  const milestoneButton = event.target.closest("[data-milestone]");
  if (milestoneButton) {
    openMilestoneModal(milestoneButton.dataset.project, milestoneButton.dataset.milestone);
    return;
  }

  const modalReportsButton = event.target.closest("[data-toggle-modal-reports]");
  if (modalReportsButton) {
    const [projectId, milestoneId] = modalReportsButton.dataset.toggleModalReports.split(":");
    state.expandedMilestoneReports[modalReportsButton.dataset.toggleModalReports] =
      !state.expandedMilestoneReports[modalReportsButton.dataset.toggleModalReports];
    openMilestoneModal(projectId, milestoneId);
    return;
  }

  const modalReportDetail = event.target.closest("[data-toggle-modal-report-detail]");
  if (modalReportDetail) {
    const modal = document.querySelector("#milestoneModal");
    const projectId = modal?.dataset.projectId;
    const milestoneId = modal?.dataset.milestoneId;
    toggleExpandedKey(state.expandedSubmissionDetails, `modal:${modalReportDetail.dataset.toggleModalReportDetail}`);
    if (projectId && milestoneId) openMilestoneModal(projectId, milestoneId);
    return;
  }

  const projectMaintenanceButton = event.target.closest("[data-project-maintenance]");
  if (projectMaintenanceButton) {
    openProjectMaintenance(projectMaintenanceButton.dataset.projectMaintenance);
    return;
  }

  const projectButton = event.target.closest("[data-project]");
  if (projectButton) {
    state.selectedId = projectButton.dataset.project;
    state.detailTab = "overview";
    renderProjectList();
    renderDetail();
    renderMetrics();
    return;
  }

  const governanceButton = event.target.closest("[data-governance-project]");
  if (governanceButton) {
    state.selectedId = governanceButton.dataset.governanceProject;
    state.detailTab = "overview";
    state.currentView = "dashboard";
    window.location.hash = getViewHash(state.currentView);
    render();
    return;
  }

  const governanceReportButton = event.target.closest("[data-governance-report]");
  if (governanceReportButton) {
    openProjectMaintenance(governanceReportButton.dataset.governanceReport);
    return;
  }

  if (event.target.closest("#modalCloseButton") || event.target.id === "milestoneModal") {
    closeMilestoneModal();
  }
});

document.addEventListener("change", (event) => {
  const metricField = event.target.closest("[data-metric-field]");
  if (metricField) {
    updateMetricDraftFromField(metricField);
    return;
  }

  const milestoneField = event.target.closest("[data-milestone-field]");
  if (milestoneField) {
    updateMilestoneDraftFromField(milestoneField);
    refreshMilestoneMaintenanceViews();
    return;
  }

  const briefField = event.target.closest("[data-brief-field]");
  if (briefField) {
    const project = getReportProject();
    const current = ensureBriefDraft(project);
    draftStore.briefs[project.id] = {
      ...current,
      [briefField.dataset.briefField]: briefField.value,
    };
    return;
  }

  const governanceField = event.target.closest("[data-governance-field]");
  if (governanceField) {
    const patch = {
      [governanceField.dataset.governanceField]: governanceField.value,
    };
    setGovernanceResolution(governanceField.dataset.governanceKey, patch);
    renderGovernance();
    saveGovernanceResolution(governanceField.dataset.governanceKey, patch)
      .then(() => {
        renderGovernance();
      })
      .catch((error) => {
        state.saveNotice = error.message;
        renderGovernance();
      });
    return;
  }

  if (event.target.matches("input[name='milestoneTitle'], input[name='milestoneDate'], select[name='milestoneStatus']")) {
    updateFocusedMilestoneFromForm();
    state.saveNotice = "";
    refreshMilestoneMaintenanceViews({ syncFields: false });
  }

  if (event.target.id === "businessLineFilter") {
    state.businessLine = event.target.value;
    state.risksExpanded = false;
    state.calendarProject = "all";
    renderSummary();
    renderDataHealth();
    renderAttention();
    renderProjectList();
    renderCalendar();
    renderRisks();
    renderMetrics();
    renderGovernance();
  }
  if (event.target.id === "governanceTypeFilter") {
    state.governanceType = event.target.value;
    renderGovernance();
  }
  if (event.target.id === "reportProjectSelect") {
    resetAllDrafts();
    resetReportEditorState();
    const milestone = getReportMilestone();
    state.selectedWeek = milestone ? getMilestoneWindow(getReportProject(), milestone).currentWeek || 1 : CURRENT_REPORT_WEEK;
    syncReportMilestoneFields();
    renderReportMilestoneRail();
    renderReportProjectBrief();
    renderReportProjectMetrics();
    renderWeekTimeline();
    renderReportStatusPanel();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const clickableDetail = event.target.closest(
    "[data-toggle-metric-detail], [data-toggle-submission-detail], [data-project-maintenance], .project-row"
  );
  if (!clickableDetail) return;
  event.preventDefault();
  clickableDetail.click();
});

document.addEventListener("input", (event) => {
  const projectCreateField = event.target.closest("[data-project-create-field]");
  if (projectCreateField) {
    const field = projectCreateField.dataset.projectCreateField;
    state.projectCreateDraft = {
      ...state.projectCreateDraft,
      [field]: projectCreateField.value,
    };
    return;
  }

  if (event.target.id === "chatPickerSearch") {
    if (state.chatSearchComposing) return;
    state.chatSearch = event.target.value;
    renderChatPickerModal();
  }

  const metricField = event.target.closest("[data-metric-field]");
  if (metricField) {
    updateMetricDraftFromField(metricField);
    return;
  }

  const milestoneField = event.target.closest("[data-milestone-field]");
  if (milestoneField) {
    updateMilestoneDraftFromField(milestoneField);
    refreshMilestoneMaintenanceViews({ renderRail: false });
    return;
  }
});

document.addEventListener("compositionstart", (event) => {
  if (event.target.id === "chatPickerSearch") {
    state.chatSearchComposing = true;
  }
});

document.addEventListener("compositionend", (event) => {
  if (event.target.id === "chatPickerSearch") {
    state.chatSearchComposing = false;
    state.chatSearch = event.target.value;
    renderChatPickerModal();
  }
});

const memberReportForm = document.querySelector("#memberReportForm");
if (memberReportForm) {
memberReportForm.addEventListener("input", (event) => {
  if (
    event.target.matches(
      "textarea[name='progress'], textarea[name='risk'], input[name='milestoneTitle'], input[name='milestoneDate'], select[name='milestoneStatus']"
    )
  ) {
    if (event.target.matches("input[name='milestoneTitle'], input[name='milestoneDate'], select[name='milestoneStatus']")) {
      updateFocusedMilestoneFromForm();
      refreshMilestoneMaintenanceViews({ syncFields: false });
    }
    state.saveNotice = "";
    renderReportStatusPanel();
  }
});

memberReportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (state.reportSubmitting) return;
  if (!memberProfile) {
    state.currentView = "register";
    window.location.hash = "register";
    authState.error = "请先通过飞书登录后再提交项目更新。";
    render();
    return;
  }
  if (!getReportableProjects().length) {
    state.saveNotice = "你暂未匹配到项目群聊，请联系管理员绑定项目群并同步成员。";
    renderMemberWorkspace();
    return;
  }

  const formData = new FormData(form);
  const projectId = String(formData.get("projectId") || memberProfile.projectId);
  const reportProject = projects.find((project) => project.id === projectId) || getReportProject();
  const report = {
    id: `s-${Date.now()}`,
    createdAt: new Date().toISOString(),
    week: state.selectedWeek,
    memberName: memberProfile.name,
    memberRole: memberProfile.role,
    projectId,
    milestoneId: state.selectedReportMilestoneId,
    progress: String(formData.get("progress") || "").trim(),
    milestoneTitle: String(formData.get("milestoneTitle") || "").trim(),
    milestoneDate: String(formData.get("milestoneDate") || "").trim(),
    milestoneStatus: String(formData.get("milestoneStatus") || "planned"),
    metrics: getProjectMetricItems(reportProject),
    risk: String(formData.get("risk") || "").trim(),
  };

  if (!hasMeaningfulProgress(report.progress)) {
    const progressField = form.elements.progress;
    progressField.setCustomValidity("请补充本周实际进展，模板标题不能作为有效内容");
    progressField.reportValidity();
    progressField.focus();
    return;
  }
  form.elements.progress.setCustomValidity("");

  const reportMilestone = getReportMilestone(reportProject);
  if (reportMilestone) report.milestoneId = reportMilestone.id;

  state.reportSubmitting = true;
  const submitButton = event.submitter || form.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "保存中...";
  }
  try {
    const payload = await saveWeeklyReport(report);
    const savedReport = payload?.report;
    applyProjectReportState(payload?.projectState);
    submissions = [savedReport || report, ...submissions.filter((item) => item.id !== savedReport?.id)].slice(0, 100);
    await loadWeeklyReports();
    state.saveNotice = buildWeeklyReportSaveNotice({
      projectName: reportProject.shortName,
      week: report.week,
      notification: payload?.notification,
    });
    form.reset();
    form.elements.progress.value = "";
    form.elements.risk.value = "";
    const projectSelect = form.querySelector("#reportProjectSelect") || document.querySelector("#reportProjectSelect");
    if (projectSelect) projectSelect.value = report.projectId;
    renderMemberWorkspace();
    renderDetail();
    renderRisks();
    renderProjectList();
    renderGovernance();
  } catch (error) {
    state.saveNotice = formatUserFacingError(error, "周报保存失败，请检查内容后稍后重试");
    renderMemberWorkspace();
  } finally {
    state.reportSubmitting = false;
    const activeSubmitButton = form.querySelector('button[type="submit"]');
    if (activeSubmitButton) {
      activeSubmitButton.disabled = false;
      activeSubmitButton.textContent = "保存本周更新";
    }
  }
});
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMilestoneModal();
});

async function bootstrapApplication() {
  render();
  await loadCurrentUser();
  render();
}

bootstrapApplication();
