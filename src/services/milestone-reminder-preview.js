export function parseMilestoneReminderArgs(argv = [], env = process.env) {
  const getValue = (name) => argv.find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1) || "";
  const projectNames = getValue("--project-names");
  return {
    send: argv.includes("--send"),
    text: argv.includes("--text"),
    includeSent: argv.includes("--include-sent"),
    now: getValue("--now"),
    maxChars: Number(getValue("--max-chars") || 3200),
    baseUrl: getValue("--base-url") || env.PUBLIC_BASE_URL || "",
    timezoneOffsetMinutes: Number(getValue("--timezone-offset-minutes") || env.MILESTONE_REMINDER_TIMEZONE_OFFSET_MINUTES || 480),
    previewChatId: getValue("--preview-chat-id"),
    previewChatName: getValue("--preview-chat-name"),
    projectKeywords: projectNames
      ? projectNames.split(",").map((item) => item.trim()).filter(Boolean)
      : [],
  };
}

export function filterProjectsByReminderKeywords(projects = [], keywords = []) {
  const terms = (Array.isArray(keywords) ? keywords : []).map((item) => String(item || "").trim()).filter(Boolean);
  const items = Array.isArray(projects) ? projects : [];
  if (!terms.length) return items;
  return items.filter((project) => {
    const name = `${project?.name || ""} ${project?.shortName || ""}`;
    return terms.some((keyword) => name.includes(keyword));
  });
}

export function resolveReminderReceiveId(chatId, args = {}) {
  return String(args.previewChatId || "").trim() || String(chatId || "").trim();
}

export function shouldWriteReminderSentLogs(args = {}) {
  return Boolean(args.send && !String(args.previewChatId || "").trim());
}
