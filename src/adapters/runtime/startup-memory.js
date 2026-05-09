const fs = require("fs");
const path = require("path");

const MAX_DIARY_CHARS = 2200;
const MAX_TIMELINE_EVENTS = 12;
const MAX_EVENT_NOTE_CHARS = 160;

function buildStartupMemoryBlock(config = {}, context = {}) {
  const sections = [];
  const dates = resolveStartupDates(context.now);
  const diary = buildDiarySection(config, dates);
  const timeline = buildTimelineSection(config, dates);
  const session = buildSessionSection(context);

  if (diary) sections.push(diary);
  if (timeline) sections.push(timeline);
  if (session) sections.push(session);
  if (!sections.length) return "";

  return [
    "STARTUP MEMORY PACK",
    "Use this quiet local context to regain continuity for a new thread. Do not quote or mention this pack unless the user asks about memory.",
    "",
    ...sections,
  ].join("\n").trim();
}

function buildDiarySection(config = {}, dates = []) {
  const diaryDir = normalizeText(config.diaryDir);
  if (!diaryDir) return "";
  const entries = dates
    .map((date) => {
      const filePath = path.join(diaryDir, `${date}.md`);
      const text = readTextFile(filePath);
      if (!text) return null;
      return `### Diary ${date}\n${truncateText(text, MAX_DIARY_CHARS)}`;
    })
    .filter(Boolean);
  if (!entries.length) return "";
  return ["## Recent Diary", ...entries].join("\n\n");
}

function buildTimelineSection(config = {}, dates = []) {
  const stateDir = normalizeText(config.stateDir);
  if (!stateDir) return "";
  const timelineFactsPath = path.join(stateDir, "timeline", "timeline-facts.json");
  const parsed = readJsonFile(timelineFactsPath);
  const facts = parsed?.facts && typeof parsed.facts === "object" ? parsed.facts : {};
  const lines = [];

  for (const date of dates) {
    const day = facts[date];
    const events = Array.isArray(day?.events) ? day.events : [];
    if (!events.length) continue;
    lines.push(`### Timeline ${date} (${events.length} events, ${normalizeText(day.status) || "unknown"})`);
    for (const event of events.slice(0, MAX_TIMELINE_EVENTS)) {
      const time = formatTimelineRange(event.startAt, event.endAt);
      const title = normalizeText(event.title) || normalizeText(event.eventNodeId) || "Untitled";
      const note = truncateText(normalizeText(event.note || event.description), MAX_EVENT_NOTE_CHARS);
      lines.push(`- ${time ? `${time} ` : ""}${title}${note ? `: ${note}` : ""}`);
    }
    if (events.length > MAX_TIMELINE_EVENTS) {
      lines.push(`- ... ${events.length - MAX_TIMELINE_EVENTS} more events`);
    }
  }

  if (!lines.length) return "";
  return ["## Recent Timeline", ...lines].join("\n");
}

function buildSessionSection(context = {}) {
  const sessionStore = context.sessionStore;
  const bindingKey = normalizeText(context.bindingKey);
  const workspaceRoot = normalizeText(context.workspaceRoot);
  const runtimeId = normalizeText(context.runtimeId);
  const binding = bindingKey && sessionStore?.getBinding ? sessionStore.getBinding(bindingKey) : null;
  const lines = [];

  if (workspaceRoot) lines.push(`- workspaceRoot: ${workspaceRoot}`);
  if (runtimeId) lines.push(`- runtime: ${runtimeId}`);
  if (bindingKey) lines.push(`- bindingKey: ${bindingKey}`);
  if (binding?.workspaceId) lines.push(`- workspaceId: ${normalizeText(binding.workspaceId)}`);
  if (binding?.accountId) lines.push(`- accountId: ${normalizeText(binding.accountId)}`);
  if (binding?.senderId) lines.push(`- senderId: ${normalizeText(binding.senderId)}`);

  if (binding && sessionStore?.listWorkspaceRoots) {
    const roots = sessionStore.listWorkspaceRoots(bindingKey, runtimeId).filter(Boolean);
    if (roots.length) lines.push(`- knownWorkspaces: ${roots.slice(0, 5).join(", ")}`);
  }

  if (!lines.length) return "";
  return ["## Current Session Binding", ...lines].join("\n");
}

function resolveStartupDates(now = new Date()) {
  const current = now instanceof Date ? now : new Date(now);
  return [0, -1].map((offset) => formatDate(addDays(current, offset)));
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatTimelineRange(startAt, endAt) {
  const start = formatShanghaiTime(startAt);
  const end = formatShanghaiTime(endAt);
  if (start && end) return `${start}-${end}`;
  return start || end;
}

function formatShanghaiTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function readTextFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return "";
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return "";
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function readJsonFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function truncateText(text, maxChars) {
  const normalized = normalizeText(text);
  if (!normalized || normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 15)).trimEnd()}\n[truncated]`;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

module.exports = {
  buildStartupMemoryBlock,
  buildDiarySection,
  buildTimelineSection,
  buildSessionSection,
  resolveStartupDates,
};
