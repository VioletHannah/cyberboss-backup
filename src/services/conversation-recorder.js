const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

class ConversationRecorder {
  constructor({ dirPath = "" } = {}) {
    this.dirPath = String(dirPath || "").trim();
  }

  recordInboundMessage({
    threadId = "",
    turnId = "",
    workspaceRoot = "",
    text = "",
    timestamp = "",
    meta = {},
  } = {}) {
    return this.append({
      type: "user",
      threadId,
      turnId,
      workspaceRoot,
      text,
      timestamp,
      meta,
    });
  }

  recordRuntimeEvent(event, { workspaceRoot = "", fallbackText = "" } = {}) {
    const type = mapRuntimeEventType(event);
    if (!type) {
      return null;
    }
    const payload = event?.payload || {};
    const text = extractRuntimeEventText(event) || fallbackText;
    return this.append({
      type,
      threadId: payload.threadId || "",
      turnId: payload.turnId || "",
      workspaceRoot,
      text,
      timestamp: payload.timestamp || event?.timestamp || "",
      meta: buildRuntimeEventMeta(event),
    });
  }

  append(entry) {
    if (!this.dirPath) {
      return null;
    }
    const timestamp = normalizeTimestamp(entry?.timestamp);
    const normalized = {
      id: normalizeText(entry?.id) || createRecordId(timestamp),
      type: normalizeText(entry?.type) || "event",
      timestamp,
      threadId: normalizeText(entry?.threadId),
      turnId: normalizeText(entry?.turnId),
      workspaceRoot: normalizeText(entry?.workspaceRoot),
      text: normalizeText(entry?.text),
      meta: normalizeMeta(entry?.meta),
    };
    fs.mkdirSync(this.dirPath, { recursive: true });
    fs.appendFileSync(
      path.join(this.dirPath, `${formatLocalDate(timestamp)}.jsonl`),
      `${JSON.stringify(normalized)}\n`,
      "utf8",
    );
    return normalized;
  }
}

function mapRuntimeEventType(event) {
  switch (event?.type) {
    case "runtime.reply.completed":
    case "runtime.turn.completed":
      return "assistant";
    case "runtime.turn.failed":
      return "assistant";
    case "runtime.approval.requested":
      return "approval";
    case "runtime.thinking":
      return "thinking";
    case "runtime.tool.use":
      return "tool_use";
    case "runtime.tool.result":
      return "tool_result";
    default:
      return "";
  }
}

function extractRuntimeEventText(event) {
  const payload = event?.payload || {};
  if (typeof payload.text === "string") {
    return payload.text;
  }
  if (event?.type === "runtime.approval.requested") {
    return payload.command || payload.reason || "";
  }
  if (typeof payload.result === "string") {
    return payload.result;
  }
  if (typeof payload.input === "string") {
    return payload.input;
  }
  return "";
}

function buildRuntimeEventMeta(event) {
  const payload = event?.payload || {};
  const meta = {
    runtimeEventType: normalizeText(event?.type),
  };
  for (const key of [
    "itemId",
    "requestId",
    "kind",
    "reason",
    "command",
    "filePath",
    "filePaths",
    "commandTokens",
    "toolName",
    "input",
    "result",
  ]) {
    if (payload[key] !== undefined) {
      meta[key] = payload[key];
    }
  }
  return meta;
}

function normalizeMeta(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return {};
  }
  return {
    ...meta,
    attachments: normalizeAttachments(meta.attachments),
  };
}

function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments)) {
    return [];
  }
  return attachments
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const filePath = normalizeText(item.filePath || item.absolutePath);
      return {
        kind: normalizeText(item.kind),
        label: normalizeText(item.label || item.sourceFileName || item.fileName || filePath),
        fileName: normalizeText(item.fileName || item.sourceFileName || path.basename(filePath)),
        filePath,
      };
    })
    .filter(Boolean);
}

function normalizeTimestamp(value) {
  const raw = normalizeText(value);
  const date = raw ? new Date(raw) : new Date();
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString();
  }
  return new Date().toISOString();
}

function formatLocalDate(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createRecordId(timestamp) {
  return `${timestamp}:${crypto.randomBytes(6).toString("hex")}`;
}

function normalizeText(value) {
  return String(value || "").trim();
}

module.exports = { ConversationRecorder };
