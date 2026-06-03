import { mergeChatMembers, renderChatMemberChips } from "./src/ui/chat-members.js";
import { chooseEffectiveProjectId } from "./src/lib/project-access.js";
import { applyProjectBriefSnapshot, buildProjectBriefUpdatePayload } from "./src/services/project-records.js";

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
  saveNotice: "",
  governanceLevel: "all",
  governanceType: "all",
  chatPickerOpen: false,
  chatPickerProjectId: "",
  chatSearch: "",
  chatSearchComposing: false,
  expandedProjectGroups: {},
  userEditModalOpen: false,
  userEditTargetId: null,
};

const sourceRows = Array.isArray(window.PROJECT_SOURCE) ? window.PROJECT_SOURCE : [];
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
  const hash = window.location.hash.replace("#", "");
  if (hash === "calendar") return "calendar";
  if (hash === "register") return "register";
  if (hash === "report" || hash === "member") return "report";
  if (hash === "governance" || hash === "pmo") return "governance";
  return "dashboard";
}

function getViewHash(view) {
  if (view === "calendar") return "calendar";
  if (view === "register") return "register";
  if (view === "report") return "report";
  if (view === "governance") return "governance";
  return "";
}

function getAllowedView(view) {
  if (!memberProfile) return view === "register" ? "register" : "register";
  if (view === "register" && !memberProfile.canManageIdentity) return memberProfile.isAdmin ? "dashboard" : "report";
  if (!memberProfile.isAdmin) return "report";
  return view;
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
  let payload = null;
  const contentType = response.headers.get("content-type") || "";
  if (text && contentType.includes("application/json")) {
    payload = JSON.parse(text);
  } else if (text && text.trim().startsWith("{")) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  } else if (text) {
    payload = {
      message: response.ok
        ? "接口返回格式异常"
        : `接口返回了 HTML 页面，可能是部署入口或 API 路径错误（HTTP ${response.status}）`,
    };
  }
  if (!response.ok) {
    const error = new Error(payload?.message || "请求失败");
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
    if (memberProfile) {
      state.currentView = getAllowedView(preferredView);
    }
    if (memberProfile?.projectId) {
      const reportProjectSelect = document.querySelector("#reportProjectSelect");
      if (reportProjectSelect) reportProjectSelect.value = memberProfile.projectId;
    }
    if (memberProfile) {
      await loadProjectChatBindings();
      await loadWeeklyReports();
    }
    if (memberProfile?.canManageIdentity) {
      await loadRoleBindings();
    } else {
      authState.users = [];
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

async function saveProjectMetrics(project) {
  const metrics = getProjectMetricItems(project).map((metric) => ({
    id: metric.id,
    name: metric.name,
    currentValue: metric.current,
    targetValue: metric.target,
    observation: metric.observation,
    chartType: metric.chartType,
  }));
  return apiRequest(`/api/projects/${project.id}/metrics`, {
    method: "PUT",
    body: JSON.stringify({ metrics }),
  });
}

async function saveProjectMilestones(project) {
  const milestones = getReportMilestones(project).map((milestone) => ({
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

function getFeishuChatById(chatId) {
  if (!chatId) return null;
  return authState.chats.find((chat) => chat.chatId === chatId) || null;
}

function applyProjectReportState(projectState) {
  if (!projectState?.projectId) return;
  const project = projects.find((item) => item.id === projectState.projectId);
  if (!project) return;
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
  if (!memberProfile || memberProfile.isAdmin) return projects;
  const allowed = new Set(memberProfile.projectIds || []);
  return projects.filter((project) => allowed.has(project.id));
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
  if (looksCompleted && (!dateInfo || dateInfo.date <= TODAY)) return "done";
  if (/开发|测试|试点|持续|进行|联调|排期中/.test(text) && dateInfo && dateInfo.date <= TODAY) return "doing";
  if (!dateInfo) return "planned";

  const diffDays = (dateInfo.date - TODAY) / 86400000;
  if (diffDays < 0) return "risk";
  if (diffDays <= 7) return "due";
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
      return {
        ...row,
        shortName: cleanProjectName(row.name),
        stage: extractStage(row.overallText),
        milestones,
        risks,
        status,
        progress: deriveProgress(row, milestones),
        metricHighlights: extractMetricHighlights(row.metricsText),
        team,
        owner: row.owner || "未填写",
        color: PROJECT_COLORS[index % PROJECT_COLORS.length],
      };
    });
}

const projects = buildProjects(sourceRows);
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
  const rawParts = milestone.dateKey ? milestone.dateKey.split("-").map(Number) : [];
  const dateInfo = rawParts.length === 3 && rawParts.every((n) => !Number.isNaN(n))
    ? parseDateFromText(milestone.dateKey) || makeDateInfo(...rawParts)
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
    status: milestone.status || inferMilestoneStatus(title, dateInfo),
    changeNote: String(milestone.changeNote || "").trim(),
  };
}

function getDefaultMetricItems(project) {
  if (project.metricHighlights.length) {
    return project.metricHighlights.map((item, index) => ({
      id: `${project.id}-metric-${index + 1}`,
      name: item.label || `指标 ${index + 1}`,
      current: item.value || "",
      target: /%$/.test(item.value || "") ? "100%" : "",
      observation: index === 0 ? compactText(project.metricsText, 90) : "",
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
  const saved = getProjectMaintenance(project.id).metrics;
  if (Array.isArray(saved) && saved.length) return saved;
  return getDefaultMetricItems(project);
}

function getProjectBriefData(project) {
  return {
    owner: String(project.owner || "未填写").trim(),
    overview: String(project.overallText || "").trim(),
  };
}

function applyProjectBrief(project, brief) {
  applyProjectBriefSnapshot(project, brief);
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
  getProjectMaintenance(project.id).metrics = metrics.map((metric, index) => ({
    id: metric.id || uid(`${project.id}-metric`),
    name: String(metric.name || `指标 ${index + 1}`).trim(),
    current: String(metric.current || "").trim(),
    target: String(metric.target || "").trim(),
    observation: String(metric.observation || "").trim(),
    history: Array.isArray(metric.history) ? metric.history.slice(-8) : [],
  }));
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
  const current = parseMetricNumber(metric.current);
  const target = parseMetricNumber(metric.target);
  if (target && current !== null) return clampPercent((current / target) * 100);
  if (current !== null && /%/.test(metric.current || "")) return clampPercent(current);
  return null;
}

function metricHasTarget(metric) {
  return parseMetricNumber(metric.target) !== null;
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
  return `${item.project.id}|${item.type}|${item.title}|${item.detail}`;
}

function getGovernanceResolution(item) {
  const saved = getGovernanceStore()[getGovernanceItemKey(item)] || {};
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
  const dated = project.milestones.filter((milestone) => milestone.dateInfo);
  if (dated.length) {
    return [...dated].sort((a, b) => {
      const aDistance = Math.abs(a.dateInfo.date - TODAY);
      const bDistance = Math.abs(b.dateInfo.date - TODAY);
      if (aDistance !== bDistance) return aDistance - bDistance;
      return a.dateInfo.date - b.dateInfo.date;
    })[0];
  }
  return project.milestones[0];
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
    const memberOnlyAllowed = memberProfile && !memberProfile.isAdmin && view !== "report";
    const anonymousBlocked = !memberProfile && view !== "register";
    const adminOnlyView = view === "governance" && !memberProfile?.isAdmin;
    const identityOnlyView = view === "register" && memberProfile && !memberProfile.canManageIdentity;
    button.classList.toggle("is-hidden", Boolean(memberOnlyAllowed || anonymousBlocked || adminOnlyView || identityOnlyView));
  });
  document.querySelectorAll(".view-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === state.currentView);
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
      helper: `${new Set(filtered.map((project) => project.businessLine)).size} 条业务线 · ${
        filtered.filter((project) => project.established !== "是").length
      } 个未立项`,
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
        ? `${next.dateInfo?.label || "未标日期"} · ${milestoneStatusMap[next.status]} · ${next.title}`
        : "暂无可识别节点";

      return `
        <button class="project-row ${project.id === state.selectedId ? "is-selected" : ""}" data-project="${
        project.id
      }" style="--project-color: ${project.color}">
          <span class="project-name">
            <strong>${escapeHtml(project.shortName)}</strong>
            <span>${escapeHtml(project.businessLine || "未填业务线")} · ${escapeHtml(project.stage)}</span>
            <span class="owner-line">负责人 ${escapeHtml(project.owner)}</span>
          </span>
          <span class="project-meta">
            <span class="status-pill ${status.className} has-tip" data-tip="${escapeHtml(
        riskTip
      )}">${status.label}</span>
            <span class="phase-pill">${project.established === "是" ? "已立项" : "未立项"}</span>
            <span class="update-pill ${currentWeekSubmission ? "is-done" : "is-missing"} has-tip" data-tip="${escapeHtml(updateTip)}">${
        currentWeekSubmission ? "本周已更" : "待更新"
      }</span>
          </span>
          <span class="project-meta">
            <span>当前关键节点</span>
            <strong>${escapeHtml(next?.title || "暂无节点")}</strong>
            <span>${escapeHtml(next?.dateInfo?.label || "未标日期")} · ${
        milestoneStatusMap[next?.status] || "计划中"
      }</span>
          </span>
          <span class="project-signal has-tip" data-tip="${escapeHtml(metricTip)}">
            <span>指标状态</span>
            <strong>${escapeHtml(metricLabel)}</strong>
            <span>${escapeHtml(metricSummary)}</span>
          </span>
          <span class="project-hover">
            <span><b>节点</b>${escapeHtml(compactText(hoverNode, 92))}</span>
            <span><b>指标</b>${escapeHtml(compactText(hoverMetric, 92))}</span>
            <span><b>风险</b>${escapeHtml(compactText(riskTip, 92))}</span>
            <span><b>更新</b>${escapeHtml(compactText(updateTip, 92))}</span>
          </span>
        </button>
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
  const milestones = calendarProjects
    .flatMap((project) =>
      project.milestones.map((milestone) => ({
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
    const dayEvents = milestones.filter((milestone) => milestone.dateInfo.day === day);
    const eventMarkup = dayEvents
      .map(
        (milestone) => `
          <button class="calendar-event has-tip" data-project="${milestone.projectId}" data-milestone="${
          milestone.id
        }" data-tip="${escapeHtml(`${milestone.projectShortName} · ${milestoneStatusMap[milestone.status] || "计划中"} · ${milestone.raw}${milestone.changeNote ? ` · 变更：${milestone.changeNote}` : ""}`)}" style="--project-color: ${milestone.projectColor}">
            <span class="calendar-event-top">
              <b>${escapeHtml(milestone.projectShortName)}</b>
              ${renderMilestoneStatusTag(milestone)}
            </span>
            <strong>${escapeHtml(compactText(milestone.title, 26))}</strong>
            ${renderChangeBadge(milestone)}
          </button>
        `
      )
      .join("");

    cells.push(`
      <div class="calendar-day">
        <div class="calendar-date">${day}</div>
        ${eventMarkup}
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
  return submissions
    .filter((item) => item.projectId === projectId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getCurrentWeekSubmission(projectId) {
  return submissions.find((item) => item.projectId === projectId && Number(item.week) === CURRENT_REPORT_WEEK);
}

function getLatestProjectSubmission(projectId) {
  return getProjectSubmissions(projectId)[0];
}

function getReportProject() {
  const select = document.querySelector("#reportProjectSelect");
  const reportableProjects = getReportableProjects();
  return reportableProjects.find((item) => item.id === select?.value) || reportableProjects[0] || projects[0];
}

function getReportMilestones(project) {
  if (!project) return [];
  return [...project.milestones].sort((a, b) => {
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
              <span>${escapeHtml(new Date(item.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }))}</span>
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

  const milestones = getReportMilestones(project).slice(0, 10).map(
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
  const updateBlock = renderProjectSubmissions(project.id);
  const overview = `
    <div class="detail-overview-grid">
      <article>
        <span>负责人</span>
        <strong>${escapeHtml(project.owner || "未填写")}</strong>
      </article>
      <article>
        <span>业务线</span>
        <strong>${escapeHtml(project.businessLine || "未填业务线")}</strong>
      </article>
      <article>
        <span>当前阶段</span>
        <strong>${escapeHtml(project.stage)}</strong>
      </article>
      <article>
        <span>立项状态</span>
        <strong>${project.established === "是" ? "已立项" : "未立项"}</strong>
      </article>
    </div>
    <div class="detail-block">
      <h3>项目概述</h3>
      ${renderTextBlock(project.overallText)}
    </div>
    <div class="detail-block">
      <h3>项目组构成</h3>
      ${renderTeamCards(project.team)}
    </div>
  `;
  const tabContent = {
    overview,
    milestones: `
      <div class="detail-block">
        <h3>当前关键节点</h3>
        ${renderTextBlock(project.mayKeyNodes)}
      </div>
      <div class="detail-block">
        <h3>里程碑计划</h3>
        <div class="timeline">${milestones.join("") || '<p class="muted-text">暂无可识别里程碑</p>'}</div>
      </div>
    `,
    metrics: `
      <div class="detail-block">
        <h3>项目指标</h3>
        ${renderDetailMetricBlock(project)}
      </div>
      <div class="detail-block">${renderTextBlock(project.metricsText, "暂无指标说明")}</div>
    `,
    updates: `
      <div class="detail-block">
        <h3>成员更新记录</h3>
        ${updateBlock}
      </div>
    `,
  };
  const tabs = [
    { key: "overview", label: "概览" },
    { key: "milestones", label: "里程碑" },
    { key: "metrics", label: "指标" },
    { key: "updates", label: "更新" },
  ];
  if (state.detailTab === "risks") state.detailTab = "overview";
  if (!tabContent[state.detailTab]) state.detailTab = "overview";

  container.innerHTML = `
    <div class="detail-kicker">
      <span class="phase-pill">${escapeHtml(project.businessLine || "未填业务线")}</span>
    </div>
    <div class="detail-title">
      <h2>${escapeHtml(project.shortName)}</h2>
      <p>${escapeHtml(project.stage)} · ${project.established === "是" ? "已立项" : "未立项"} · ${
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

function renderProjectSelects() {
  const reportableProjects = getReportableProjects();
  const options = reportableProjects
    .map((project) => `<option value="${project.id}">${escapeHtml(project.shortName)} · ${escapeHtml(project.businessLine || "未填业务线")}</option>`)
    .join("");
  const reportProjectSelect = document.querySelector("#reportProjectSelect");
  if (reportProjectSelect) {
    reportProjectSelect.innerHTML = options || '<option value="">暂无可维护项目</option>';
    reportProjectSelect.disabled = !reportableProjects.length;
  }

  if (memberProfile?.projectId && reportProjectSelect && reportableProjects.some((project) => project.id === memberProfile.projectId)) {
    reportProjectSelect.value = memberProfile.projectId;
  } else if (reportProjectSelect && reportableProjects[0]) {
    reportProjectSelect.value = reportableProjects[0].id;
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
  const hideLoginBox = Boolean(memberProfile);
  loginWrapper?.classList.toggle("is-hidden", hideLoginBox);
  registerHero?.classList.toggle("is-hidden", hideLoginBox);
  registerLayout?.classList.toggle("is-managing-identity", Boolean(memberProfile?.canManageIdentity));

  if (authState.loading) {
    loginWrapper?.classList.remove("is-hidden");
    registerHero?.classList.remove("is-hidden");
    registerLayout?.classList.remove("is-managing-identity");
    authPanel.innerHTML = '<div class="empty-state">正在校验飞书登录状态...</div>';
    roleBindingWrapper.classList.add("is-hidden");
    roleBindingPanel.innerHTML = '<div class="empty-state">稍候加载权限信息</div>';
    return;
  }

  if (!memberProfile) {
    authPanel.innerHTML = `
      <div class="auth-stack login-entry">
        <span class="login-status-dot">未登录</span>
        <div class="auth-copy">
          <strong>使用飞书登录</strong>
          <p>完成企业身份验证后进入系统。</p>
        </div>
        <div class="auth-actions">
          <button class="primary-action feishu-login-button" type="button" data-feishu-login>使用飞书登录</button>
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
        <span>默认项目：${escapeHtml(projects.find((project) => project.id === memberProfile.projectId)?.shortName || "未设置")}</span>
      </div>
      <div class="auth-actions">
        <button class="primary-action compact-action" type="button" data-view="${memberProfile.isAdmin ? "dashboard" : "report"}">${
          memberProfile.isAdmin ? "进入管理看板" : "进入项目维护"
        }</button>
        <button class="secondary-action" type="button" data-logout>退出登录</button>
      </div>
    </div>
  `;

  if (!memberProfile.canManageIdentity) {
    roleBindingWrapper.classList.add("is-hidden");
    roleBindingPanel.innerHTML = "";
    return;
  }

  roleBindingWrapper.classList.remove("is-hidden");

  // Group users by projectId
  const adminUsers = sortUsersByName(authState.users.filter((user) => user.roleKey === "ADMIN"));
  const projectUsers = {};
  const unassignedUsers = [];
  for (const user of authState.users.filter((item) => item.roleKey !== "ADMIN")) {
    if (user.projectId && projects.some((p) => p.id === user.projectId)) {
      if (!projectUsers[user.projectId]) projectUsers[user.projectId] = [];
      projectUsers[user.projectId].push(user);
    } else {
      unassignedUsers.push(user);
    }
  }

  const groupEntries = [
    ...(adminUsers.length
      ? [{ project: { id: "__admins", shortName: "管理员", businessLine: "统一管理全局权限", color: "#5b4cc4" }, users: adminUsers }]
      : []),
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
            .map((item) => `<p><strong>${escapeHtml(item.name || item.chatId)}</strong>${escapeHtml(item.message || "成员读取失败")}</p>`)
            .join("")}</div>`
        : ""
    }
    <div class="project-group-list">
      ${groupEntries
        .map(
          ({ project, users }) => {
            const isExpanded = state.expandedProjectGroups[project.id] !== false;
            const arrow = isExpanded ? "▾" : "▸";
            return `
              <article class="project-group-card ${isExpanded ? "is-expanded" : ""}" data-project-group="${project.id}">
                <button class="project-group-head" type="button" data-toggle-project-group="${project.id}">
                  <span class="project-group-avatar" style="--project-color: ${escapeHtml(project.color || "#6b7280")}">${escapeHtml(project.shortName.slice(0, 1))}</span>
                  <div class="project-group-meta">
                    <strong>${escapeHtml(project.shortName)}</strong>
                    <span>${users.length} 人 · ${escapeHtml(project.businessLine || "")}</span>
                  </div>
                  <span class="project-group-arrow">${arrow}</span>
                </button>
                <div class="project-group-body ${isExpanded ? "" : "is-collapsed"}">
                  <div class="avatar-strip">
                    ${users
                      .map(
                        (user) => `
                          <button class="avatar-chip" type="button" data-open-user-edit="${user.id}" title="${escapeHtml(user.name)} · ${escapeHtml(getUserContactLabel(user))}">
                            <span class="identity-avatar is-small">${escapeHtml(getDisplayInitials(user.name))}</span>
                            <span class="avatar-chip-label">${escapeHtml(user.name)}</span>
                          </button>
                        `
                      )
                      .join("")}
                  </div>
                </div>
              </article>
            `;
          }
        )
        .join("")}
      ${!groupEntries.length ? '<div class="empty-state">暂无已登录用户</div>' : ""}
    </div>
    <div class="role-binding-head project-chat-head">
      <strong>项目群聊绑定</strong>
      <div class="role-binding-toolbar">
        <button class="tiny-action" type="button" data-sync-my-feishu-chats ${authState.chatSyncing ? "disabled" : ""}>${syncChatLabel}</button>
      </div>
      <span>先同步你账号加入的群聊和成员，再将项目绑定到对应群聊。</span>
    </div>
    <div class="role-binding-list chat-binding-grid">
      ${projects
        .map((project) => {
          const chat = getFeishuChatById(project.feishuChatId);
          const chatMembers = chat?.members || [];
          return `
            <article class="binding-row project-chat-row" data-project-chat-row="${project.id}">
              <div class="binding-user">
                <span class="identity-avatar is-small">${escapeHtml(project.shortName.slice(0, 1))}</span>
                <div>
                  <strong>${escapeHtml(project.shortName)}</strong>
                  <span>${escapeHtml(chat?.name || project.businessLine || "未填业务线")}</span>
                </div>
              </div>
              <label>
                <span>群聊 chat_id</span>
                <input data-project-chat-id="${project.id}" value="${escapeHtml(project.feishuChatId || "")}" placeholder="请选择群聊" readonly />
              </label>
              <div class="project-chat-members">
                ${renderChatMemberChips(chatMembers, { limit: 6 })}
              </div>
              <div class="binding-actions">
                <button class="secondary-action compact-action" type="button" data-open-chat-picker="${project.id}">选择群聊</button>
                <button class="secondary-action compact-action" type="button" data-sync-project-chat="${project.id}">同步成员</button>
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
        <input id="chatPickerSearch" value="${escapeHtml(state.chatSearch)}" placeholder="搜索群聊名称、chat_id 或成员姓名" />
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
                        <strong>${escapeHtml(chat.name || chat.chatId)}</strong>
                        <span>${Number(chat.memberCount || chat.members?.length || 0)} 人</span>
                        ${renderChatMemberChips(chat.members || [], { limit: 12 })}
                      </div>
                      <button class="primary-action compact-action" type="button" data-pick-chat="${escapeHtml(chat.chatId)}">选择</button>
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
        <button class="primary-action" type="button" data-save-user-edit="${user.id}">保存绑定</button>
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

  container.innerHTML = `
    <article class="report-brief-card" style="--project-color: ${project.color}">
      <header class="brief-card-head">
        <span>
          <strong>${escapeHtml(project.shortName)}</strong>
          <small>${escapeHtml(project.businessLine || "未填业务线")}</small>
        </span>
        <button class="tiny-action" type="button" id="briefEditToggle">${state.briefEditMode ? "完成" : "编辑"}</button>
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
                <span>项目概述</span>
                <textarea rows="3" data-brief-field="overview" placeholder="补充项目目标、范围和当前重点">${escapeHtml(brief.overview)}</textarea>
              </label>
              <button class="secondary-action" type="button" data-save-brief>保存概览</button>
            </div>
          `
          : `
            <p>负责人：${escapeHtml(brief.owner || "未填写")}</p>
            <p>项目概述：${escapeHtml(compactText(brief.overview, 110))}</p>
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
  const normalized = String(text || "")
    .replace(/第\d+周更新/g, "")
    .replace(/已完成|进行中|下周计划|需要协调|阻塞点|预计恢复时间/g, "")
    .replace(/[：:\s。；;，,、\-—]/g, "")
    .trim();
  return normalized.length >= 3;
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
  const progressText = savedReport?.progress || "";
  const riskText = savedReport?.risk || "";
  const items = [
    {
      label: "进展",
      done: Boolean(progressText),
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
  const savedTime = savedReport ? new Date(savedReport.createdAt).toLocaleString("zh-CN") : "";

  container.innerHTML = `
    <article class="report-status-card ${statusClass}">
      <div class="status-orbit">
        <strong>${doneCount}</strong>
        <span>/4</span>
      </div>
      <div class="status-copy">
        <b>${escapeHtml(statusText)}</b>
        <p>${savedReport ? `最近保存：${escapeHtml(savedTime)}` : "保存后将同步到管理看板、项目详情和 PMO 未更新检查"}</p>
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

function renderMetricVisual(metric, index, project) {
  const progress = getMetricProgress(metric);
  const hasTarget = metricHasTarget(metric);
  const hasNumber = parseMetricNumber(metric.current) !== null;
  const hasCurrentText = Boolean(String(metric.current || "").trim());
  const hasTargetOnly = hasTarget && !String(metric.current || "").trim();
  const toneClass = hasTarget ? "is-target" : hasNumber ? "is-number" : "is-qualitative";
  const label = hasTargetOnly ? "目标值" : hasTarget ? "目标达成" : hasCurrentText ? "当前值" : "观测口径";

  if (hasTargetOnly) {
    return `
      <article class="metric-visual-card ${toneClass} is-target-only" style="--project-color: ${project.color}">
        <div class="metric-visual-copy">
          <span>${label}</span>
          <strong>${escapeHtml(metric.name || `指标 ${index + 1}`)}</strong>
          <p>${escapeHtml(metric.observation || "仅维护目标值")}</p>
        </div>
        <div class="metric-hero-value">${escapeHtml(metric.target || "待填目标")}</div>
      </article>
    `;
  }

  if (progress !== null) {
    return `
      <article class="metric-visual-card ${toneClass}" style="--project-color: ${project.color}; --chart-angle: ${progress * 3.6}deg">
        <div class="metric-visual-copy">
          <span>${label}</span>
          <strong>${escapeHtml(metric.name || `指标 ${index + 1}`)}</strong>
          <p>${escapeHtml(metric.current || "待填当前值")}${metric.target ? ` / 目标 ${escapeHtml(metric.target)}` : ""}</p>
        </div>
        <div class="metric-hero-visual">
          <div class="metric-ring metric-ring-large metric-pie"><span>${progress}%</span></div>
        </div>
      </article>
    `;
  }

  return `
    <article class="metric-visual-card ${toneClass}" style="--project-color: ${project.color}">
      <div class="metric-visual-copy">
        <span>${label}</span>
        <strong>${escapeHtml(metric.name || `指标 ${index + 1}`)}</strong>
        <p>${escapeHtml(metric.observation || "未设置目标值，可先维护当前表现和观测口径。")}</p>
      </div>
      <div class="metric-hero-value">${escapeHtml(metric.current || metric.target || "待填")}</div>
    </article>
  `;
}

function renderMilestoneStatusTag(milestone) {
  const status = milestone.status || "planned";
  const label = milestoneStatusMap[status] || milestoneStatusMap.planned;
  return `<span class="calendar-state ${status}">${escapeHtml(label)}</span>`;
}

function renderChangeBadge(milestone) {
  if (milestone.status !== "changed" && !milestone.changeNote) return "";
  const note = milestone.changeNote ? compactText(milestone.changeNote, 28) : "请补充变更原因";
  return `<small class="change-where">变更：${escapeHtml(note)}</small>`;
}

function renderReportProjectMetrics() {
  const project = getReportProject();
  const container = document.querySelector("#reportProjectMetrics");
  if (!container || !project) return;
  const metrics = getProjectMetricItems(project);
  const editableMetrics = state.metricEditMode ? ensureMetricDraft(project) : metrics;
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
            <span>观测口径</span>
            <input value="${escapeHtml(metric.observation)}" data-metric-field="observation" data-metric-id="${metric.id}" placeholder="例如：每周一查看上周门店数据" />
          </label>
          <button class="secondary-action compact-action" type="button" data-record-metric="${metric.id}">记录本期</button>
          <button class="ghost-danger" type="button" data-delete-metric="${metric.id}">删除</button>
        </article>
      `
    )
    .join("");

  container.innerHTML = `
    <div class="metric-workbench-head">
      <div>
        <strong>${metrics.length} 个指标</strong>
      </div>
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
          <button class="secondary-action" type="button" data-save-metrics>保存指标</button>
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
  if (toggle) toggle.textContent = state.milestoneManageMode ? "完成" : "维护";
  const addButton = document.querySelector(".milestone-add-button");
  if (addButton) addButton.classList.toggle("is-visible", state.milestoneManageMode);
  const saveButton = document.querySelector(".milestone-save-button");
  if (saveButton) saveButton.classList.toggle("is-visible", state.milestoneManageMode);

  const milestones = (state.milestoneManageMode ? ensureMilestoneDraft(project) : getReportMilestones(project)).slice(0, 10);
  if (!milestones.length) {
    container.innerHTML = `
      <div class="empty-state">暂无可维护里程碑</div>
      <button class="secondary-action" type="button" data-add-milestone>新增里程碑</button>
    `;
    return;
  }

  const activeMilestoneId = getReportMilestone(project)?.id;
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
    .join("");
}

function renderWeekTimeline() {
  const container = document.querySelector("#weekTimeline");
  const prompt = document.querySelector("#weekPrompt");
  const rangeLabel = document.querySelector("#weekRangeLabel");
  const snapshot = document.querySelector("#weekSnapshot");
  const focus = document.querySelector(".milestone-focus");
  const editToggle = document.querySelector("#milestoneEditToggle");
  const project = getReportProject();
  const milestone = getReportMilestone(project);
  if (!container || !prompt || !snapshot || !project || !milestone) return;

  if (focus) focus.classList.toggle("is-editing", state.milestoneEditMode);
  if (editToggle) editToggle.textContent = state.milestoneEditMode ? "收起" : "修改";

  const windowInfo = getMilestoneWindow(project, milestone);
  state.selectedWeek = Math.min(state.selectedWeek, windowInfo.weekCount);
  if (state.selectedWeek < 1) state.selectedWeek = windowInfo.currentWeek || 1;
  const selectedReport = getWeekSubmission(project.id, state.selectedWeek, milestone.id);
  const currentReport = getWeekSubmission(project.id, windowInfo.currentWeek, milestone.id);
  if (rangeLabel) rangeLabel.textContent = `${windowInfo.label} · ${windowInfo.weekCount}周`;
  prompt.textContent = selectedReport
    ? `${milestone.title}`
    : state.selectedWeek === windowInfo.currentWeek && windowInfo.hasStarted
      ? `${milestone.title} · 维护当前节点`
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
        <strong>${escapeHtml(windowInfo.label)} · 第${state.selectedWeek}周记录</strong>
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
      <strong>${escapeHtml(windowInfo.label)} · 第${state.selectedWeek}周待维护</strong>
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
  if (!submissions.length) {
    list.innerHTML = '<div class="empty-state">还没有填报记录</div>';
    return;
  }

  list.innerHTML = submissions
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 8)
    .map((item) => {
      const project = projects.find((projectItem) => projectItem.id === item.projectId);
      return `
        <article class="submission-item">
          <header>
            <strong>第${escapeHtml(item.week || CURRENT_REPORT_WEEK)}周 · ${escapeHtml(project?.shortName || "未知项目")}</strong>
            <span>${escapeHtml(item.memberName)} · ${escapeHtml(item.memberRole)}</span>
          </header>
          <small>${escapeHtml(item.milestoneTitle || "未关联里程碑")}</small>
          <p>${escapeHtml(compactText(item.progress, 130))}</p>
          <small>${escapeHtml(new Date(item.createdAt).toLocaleString("zh-CN"))}</small>
        </article>
      `;
    })
    .join("");
}

function openMilestoneModal(projectId, milestoneId) {
  const project = projects.find((item) => item.id === projectId);
  const milestone = project?.milestones.find((item) => item.id === milestoneId);
  if (!project || !milestone) return;

  state.selectedId = projectId;
  state.selectedMilestone = milestoneId;
  renderProjectList();
  renderDetail();
  renderMetrics();

  document.querySelector("#milestoneModalContent").innerHTML = `
    <p class="modal-eyebrow">${escapeHtml(project.businessLine || "未填业务线")} · ${escapeHtml(milestone.source)}</p>
    <h2 id="milestoneModalTitle">${escapeHtml(project.shortName)}</h2>
    <div class="modal-status-line">
      <span class="calendar-status ${milestone.status}">${milestoneStatusMap[milestone.status]}</span>
      <span>${escapeHtml(milestone.dateInfo?.label || "未标日期")}</span>
    </div>
    <h3>${escapeHtml(milestone.title)}</h3>
    <p>${escapeHtml(milestone.raw)}</p>
    ${milestone.changeNote ? `<p><strong>变更原因：</strong>${escapeHtml(milestone.changeNote)}</p>` : ""}
  `;
  const modal = document.querySelector("#milestoneModal");
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function closeMilestoneModal() {
  const modal = document.querySelector("#milestoneModal");
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
    list.innerHTML = '<div class="empty-state">当前没有需要 PMO 介入的治理事项</div>';
    return;
  }

  if (!filteredItems.length) {
    list.innerHTML = '<div class="empty-state">当前筛选条件下没有治理事项，可切换优先级或类型查看</div>';
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
            <button type="button" data-governance-report="${item.project.id}">去维护</button>
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
  renderAttention();
  renderFilters();
  renderProjectList();
  renderCalendar();
  renderDetail();
  renderRisks();
  renderMetrics();
  renderProjectSelects();
  renderAuthCenter();
  renderChatPickerModal();
  renderUserEditModal();
  renderMemberWorkspace();
  renderGovernance();
}

function openProjectMaintenance(projectId) {
  state.currentView = "report";
  resetAllDrafts();
  resetReportEditorState();
  window.location.hash = getViewHash(state.currentView);
  render();
  const select = document.querySelector("#reportProjectSelect");
  if (select) select.value = projectId;
  const milestone = getReportMilestone(getReportProject());
  state.selectedWeek = milestone ? getMilestoneWindow(getReportProject(), milestone).currentWeek || 1 : CURRENT_REPORT_WEEK;
  syncReportMilestoneFields();
  renderMemberWorkspace();
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

  const toggleProjectGroupButton = event.target.closest("[data-toggle-project-group]");
  if (toggleProjectGroupButton) {
    const groupId = toggleProjectGroupButton.dataset.toggleProjectGroup;
    const isExpanded = state.expandedProjectGroups[groupId] !== false;
    state.expandedProjectGroups[groupId] = !isExpanded;
    renderAuthCenter();
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
    const role = document.querySelector(`[data-edit-user-role="${userId}"]`)?.value || "MEMBER";
    const defaultProjectId = document.querySelector(`[data-edit-user-project="${userId}"]`)?.value || "";
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
    saveProjectChatBinding(projectId, chatId)
      .then(() => syncProjectChatMembers(projectId, chatId))
      .then((payload) => {
        const project = projects.find((item) => item.id === projectId);
        if (project) project.feishuChatId = payload.chatId || chatId;
        authState.chats = mergeChatMembers(authState.chats, payload.chatId || chatId, payload.members || []);
        authState.bindingError = `已绑定群聊并同步 ${payload.members?.length || 0} 位成员。`;
        state.chatPickerOpen = false;
        render();
      })
      .catch((error) => {
        authState.bindingError = error.message;
        render();
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
    const chatId = document.querySelector(`[data-project-chat-id="${projectId}"]`)?.value || "";
    syncProjectChatMembers(projectId, chatId)
      .then((payload) => {
        if (!payload) { authState.bindingError = "群成员同步失败，请重试。"; return; }
        const project = projects.find((item) => item.id === projectId);
        if (project) project.feishuChatId = payload.chatId || chatId;
        authState.chats = mergeChatMembers(authState.chats, payload.chatId || chatId, payload.members || []);
        authState.bindingError = `已同步 ${payload.members?.length || 0} 位群成员。`;
        return loadRoleBindings();
      })
      .then(() => renderAuthCenter())
      .catch((error) => {
        authState.bindingError = error.message;
        renderAuthCenter();
      });
    return;
  }

  const monthButton = event.target.closest("[data-month-shift]");
  if (monthButton) {
    shiftCalendarMonth(Number(monthButton.dataset.monthShift));
    renderSummary();
    renderAttention();
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

  const metricEditToggle = event.target.closest("#metricEditToggle");
  if (metricEditToggle) {
    const project = getReportProject();
    if (!state.metricEditMode) ensureMetricDraft(project);
    else resetMetricDraft(project.id);
    state.metricEditMode = !state.metricEditMode;
    renderReportProjectMetrics();
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
      state.saveNotice = error.message;
    }
    renderReportProjectBrief();
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
    });
    state.metricEditMode = true;
    renderReportProjectMetrics();
    return;
  }

  const deleteMetric = event.target.closest("[data-delete-metric]");
  if (deleteMetric) {
    const project = getReportProject();
    const metrics = ensureMetricDraft(project).filter((metric) => metric.id !== deleteMetric.dataset.deleteMetric);
    draftStore.metrics[project.id] = metrics.length ? metrics : getDefaultMetricItems(project);
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
    commitMetricDraft(project);
    state.metricEditMode = false;
    state.saveNotice = "正在保存项目指标...";
    renderMemberWorkspace();
    saveProjectMetrics(project)
      .then(() => {
        state.saveNotice = "项目指标已保存。";
      })
      .catch((error) => {
        state.saveNotice = error.message;
      })
      .finally(() => {
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
    if (!state.milestoneManageMode) ensureMilestoneDraft(project);
    else resetMilestoneDraft(project.id);
    state.milestoneManageMode = !state.milestoneManageMode;
    renderReportMilestoneRail();
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
    state.milestoneManageMode = true;
    renderReportMilestoneRail();
    return;
  }

  const deleteMilestone = event.target.closest("[data-delete-milestone]");
  if (deleteMilestone) {
    const project = getReportProject();
    const milestones = ensureMilestoneDraft(project).filter((milestone) => milestone.id !== deleteMilestone.dataset.deleteMilestone);
    draftStore.milestones[project.id] = milestones;
    state.selectedReportMilestoneId = milestones[0]?.id || null;
    renderReportMilestoneRail();
    return;
  }

  const saveMilestonesButton = event.target.closest("[data-save-milestones]");
  if (saveMilestonesButton) {
    const project = getReportProject();
    commitMilestoneDraft(project);
    state.milestoneManageMode = false;
    state.saveNotice = "正在保存项目里程碑...";
    renderMemberWorkspace();
    saveProjectMilestones(project)
      .then(() => {
        state.saveNotice = "项目里程碑已保存。";
      })
      .catch((error) => {
        state.saveNotice = error.message;
      })
      .finally(() => {
        renderReportMilestoneRail();
        renderWeekTimeline();
        renderReportProjectBrief();
        renderCalendar();
        renderDetail();
        renderGovernance();
        renderReportStatusPanel();
        renderSummary();
      });
    return;
  }

  const templateButton = event.target.closest("[data-template]");
  if (templateButton) {
    const form = document.querySelector("#memberReportForm");
    if (templateButton.dataset.template === "progress") {
      form.elements.progress.value = `第${state.selectedWeek}周更新\n已完成：\n进行中：\n下周计划：\n需要协调：`;
    }
    if (templateButton.dataset.template === "riskfree") {
      form.elements.risk.value = "暂无";
    }
    if (templateButton.dataset.template === "blocker") {
      form.elements.progress.value = `第${state.selectedWeek}周更新\n已完成：\n阻塞点：\n需要协调：\n预计恢复时间：`;
      form.elements.risk.value = "存在待协调事项：";
    }
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
    const nextTitle = String(form.elements.milestoneTitle.value || milestone.title).trim();
    const nextDate = String(form.elements.milestoneDate.value || milestone.dateInfo?.key || "").trim();
    const nextStatus = editableMilestoneStatusMap[form.elements.milestoneStatus.value] ? form.elements.milestoneStatus.value : "planned";
    const milestones = getReportMilestones(project).map((item) => {
      if (item.id !== milestone.id) return item;
      return normalizeMilestone(project, {
        ...serializeMilestone(item),
        title: nextTitle,
        raw: nextTitle,
        dateKey: nextDate,
        status: nextStatus,
      });
    });
    setProjectMilestones(project, milestones);
    state.milestoneEditMode = false;
    state.saveNotice = "正在保存项目里程碑...";
    renderMemberWorkspace();
    saveProjectMilestones(project)
      .then(() => {
        state.saveNotice = "项目里程碑已保存。";
      })
      .catch((error) => {
        state.saveNotice = error.message;
      })
      .finally(() => {
        syncReportMilestoneFields();
        renderReportMilestoneRail();
        renderWeekTimeline();
        renderReportProjectBrief();
        renderCalendar();
        renderDetail();
        renderReportStatusPanel();
        renderSummary();
      });
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
    const project = getReportProject();
    const metrics = ensureMetricDraft(project).map((metric) =>
      metric.id === metricField.dataset.metricId
        ? { ...metric, [metricField.dataset.metricField]: metricField.value }
        : metric
    );
    draftStore.metrics[project.id] = metrics;
    return;
  }

  const milestoneField = event.target.closest("[data-milestone-field]");
  if (milestoneField) {
    const project = getReportProject();
    const milestones = ensureMilestoneDraft(project).map((milestone) => {
      if (milestone.id !== milestoneField.dataset.milestoneId) return milestone;
      const next = { ...milestone, [milestoneField.dataset.milestoneField]: milestoneField.value };
      if (milestoneField.dataset.milestoneField === "title") next.raw = milestoneField.value;
      return normalizeMilestone(project, next);
    });
    draftStore.milestones[project.id] = milestones;
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
    setGovernanceResolution(governanceField.dataset.governanceKey, {
      [governanceField.dataset.governanceField]: governanceField.value,
    });
    renderGovernance();
    return;
  }

  if (event.target.matches("input[name='milestoneDate'], select[name='milestoneStatus']")) state.saveNotice = "";

  if (event.target.id === "businessLineFilter") {
    state.businessLine = event.target.value;
    state.risksExpanded = false;
    state.calendarProject = "all";
    renderSummary();
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

document.addEventListener("input", (event) => {
  if (event.target.id === "chatPickerSearch") {
    if (state.chatSearchComposing) return;
    state.chatSearch = event.target.value;
    renderChatPickerModal();
  }

  const milestoneField = event.target.closest("[data-milestone-field]");
  if (milestoneField) {
    const project = getReportProject();
    const milestones = ensureMilestoneDraft(project).map((milestone) => {
      if (milestone.id !== milestoneField.dataset.milestoneId) return milestone;
      const next = { ...milestone, [milestoneField.dataset.milestoneField]: milestoneField.value };
      if (milestoneField.dataset.milestoneField === "title") next.raw = milestoneField.value;
      return normalizeMilestone(project, next);
    });
    draftStore.milestones[project.id] = milestones;
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
    state.saveNotice = "";
  }
});

memberReportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
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

  const formData = new FormData(event.currentTarget);
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
    const progressField = event.currentTarget.elements.progress;
    progressField.setCustomValidity("请补充本周实际进展，模板标题不能作为有效内容");
    progressField.reportValidity();
    progressField.focus();
    return;
  }
  event.currentTarget.elements.progress.setCustomValidity("");

  const reportMilestone = getReportMilestone(reportProject);
  if (reportMilestone) report.milestoneId = reportMilestone.id;

  try {
    const payload = await saveWeeklyReport(report);
    const savedReport = payload?.report;
    applyProjectReportState(payload?.projectState);
    submissions = [savedReport || report, ...submissions.filter((item) => item.id !== savedReport?.id)].slice(0, 100);
    await loadWeeklyReports();
    state.saveNotice = `已保存 ${reportProject.shortName} 第${report.week}周更新，已同步到服务端`;
    event.currentTarget.reset();
    document.querySelector("#reportProjectSelect").value = report.projectId;
    renderMemberWorkspace();
    renderDetail();
    renderRisks();
    renderProjectList();
    renderGovernance();
  } catch (error) {
    state.saveNotice = error.message || "周报保存失败，请稍后重试";
    renderMemberWorkspace();
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
