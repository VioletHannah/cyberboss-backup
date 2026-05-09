const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const CATEGORY_FILES = {
  facts: "facts.md",
  preferences: "preferences.md",
  patterns: "patterns.md",
  projects: "projects.md",
  open_loops: "open_loops.md",
  relationships: "relationships.md",
  profile: "profile.md",
};

const PRIORITY_CATEGORY = {
  hard_fact: "facts",
  hard_preference: "preferences",
  soft_preference: "preferences",
  pattern: "patterns",
  project: "projects",
  open_loop: "open_loops",
  relationship: "relationships",
};

class MemoryService {
  constructor(config = {}) {
    const stateDir = config.stateDir || path.join(os.homedir(), ".cyberboss");
    this.memoryDir = config.memoryDir || path.join(stateDir, "memory");
    this.indexFile = config.memoryIndexFile || path.join(this.memoryDir, "index.jsonl");
    this.pendingFile = config.memoryPendingFile || path.join(this.memoryDir, "pending.jsonl");
    this.opsFile = config.memoryOpsFile || path.join(this.memoryDir, "ops.jsonl");
    this.backupsDir = path.join(this.memoryDir, "backups");
  }

  initialize() {
    fs.mkdirSync(this.memoryDir, { recursive: true });
    for (const fileName of Object.values(CATEGORY_FILES)) {
      ensureFile(path.join(this.memoryDir, fileName), `# ${fileName.replace(/\.md$/i, "")}\n`);
    }
    ensureFile(this.indexFile, "");
    ensureFile(this.pendingFile, "");
    ensureFile(this.opsFile, "");
  }

  listFiles() {
    this.initialize();
    return Object.values(CATEGORY_FILES).map((fileName) => path.join(this.memoryDir, fileName));
  }

  readIndex(filter = {}) {
    this.initialize();
    return readJsonl(this.indexFile).filter((entry) => matchesFilter(entry, filter));
  }

  readPending(filter = {}) {
    this.initialize();
    return readJsonl(this.pendingFile).filter((entry) => matchesFilter(entry, filter));
  }

  readOps(filter = {}) {
    this.initialize();
    return readJsonl(this.opsFile).filter((entry) => matchesFilter(entry, filter));
  }

  readMarkdown(category) {
    this.initialize();
    const filePath = this.resolveCategoryFile(category);
    return fs.readFileSync(filePath, "utf8");
  }

  appendMemory(entry = {}, options = {}) {
    this.initialize();
    const normalized = normalizeMemoryEntry(entry);
    const duplicate = this.findDuplicate(normalized);
    if (duplicate) {
      this.appendOperation("skip_duplicate", { candidate: normalized, existingId: duplicate.id });
      return { status: "duplicate", entry: duplicate };
    }
    const conflict = this.findConflict(normalized);
    if (conflict && !options.allowConflict) {
      const pending = this.appendPending({
        ...normalized,
        pendingReason: "conflict",
        conflictWith: conflict.id,
      });
      this.appendOperation("conflict_pending", { candidateId: pending.id, conflictWith: conflict.id });
      return { status: "conflict", entry: pending, conflict };
    }

    appendJsonl(this.indexFile, normalized);
    appendMarkdownEntry(this.resolveCategoryFile(normalized.category), normalized);
    this.appendOperation("write", { entryId: normalized.id, entry: normalized });
    return { status: "written", entry: normalized };
  }

  searchMemory(query) {
    const normalized = normalizeSearch(query);
    if (!normalized) {
      return [];
    }
    return this.readIndex().filter((entry) => {
      const haystack = [
        entry.id,
        entry.category,
        entry.key,
        serializeValue(entry.value),
        entry.text,
        entry.priority,
      ].join(" ").toLowerCase();
      return haystack.includes(normalized);
    });
  }

  findDuplicate(candidate = {}) {
    const normalized = normalizeMemoryEntry(candidate);
    return this.readIndex({
      category: normalized.category,
      key: normalized.key,
      status: "active",
    }).find((entry) =>
      normalizeComparable(entry.value) === normalizeComparable(normalized.value)
      || normalizeComparable(entry.text) === normalizeComparable(normalized.text)
    ) || null;
  }

  findConflict(candidate = {}) {
    const normalized = normalizeMemoryEntry(candidate);
    return this.readIndex({
      category: normalized.category,
      key: normalized.key,
      status: "active",
    }).find((entry) => normalizeComparable(entry.value) !== normalizeComparable(normalized.value)) || null;
  }

  markDeleted(id) {
    const result = this.updateIndexEntry(id, (entry) => ({
      ...entry,
      status: "deleted",
      deletedAt: nowIso(),
      updatedAt: nowIso(),
    }));
    if (result.updated) {
      this.appendOperation("delete", { entryId: id, before: result.before, after: result.after });
      this.rewriteCategoryMarkdown(result.after.category);
    }
    return result.after || null;
  }

  markSuperseded(id) {
    const result = this.updateIndexEntry(id, (entry) => ({
      ...entry,
      status: "superseded",
      updatedAt: nowIso(),
    }));
    if (result.updated) {
      this.appendOperation("supersede", { entryId: id, before: result.before, after: result.after });
      this.rewriteCategoryMarkdown(result.after.category);
    }
    return result.after || null;
  }

  updateMemory(key, value) {
    this.initialize();
    const normalizedKey = normalizeKey(key);
    const active = this.readIndex({ status: "active" }).find((entry) => entry.key === normalizedKey);
    if (!active) {
      return { status: "missing", entry: null };
    }
    const old = this.markSuperseded(active.id);
    const next = normalizeMemoryEntry({
      ...active,
      id: makeMemoryId(),
      value,
      text: String(value),
      status: "active",
      supersedes: active.id,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      deletedAt: "",
    });
    appendJsonl(this.indexFile, next);
    appendMarkdownEntry(this.resolveCategoryFile(next.category), next);
    this.appendOperation("update", { oldId: active.id, newId: next.id, before: old || active, after: next });
    return { status: "updated", entry: next, previous: old || active };
  }

  undoLastWrite() {
    const ops = this.readOps();
    const op = [...ops].reverse().find((item) =>
      ["write", "update", "delete", "approve"].includes(item.op)
      && item.status !== "undone"
    );
    if (!op) {
      return { status: "missing" };
    }
    if (op.op === "write" || op.op === "approve") {
      this.updateIndexEntry(op.entryId || op.approvedId, (entry) => ({ ...entry, status: "deleted", deletedAt: nowIso(), updatedAt: nowIso() }));
    } else if (op.op === "delete") {
      this.replaceIndexEntry(op.entryId, op.before);
    } else if (op.op === "update") {
      this.replaceIndexEntry(op.oldId, { ...op.before, status: "active", updatedAt: nowIso() });
      this.updateIndexEntry(op.newId, (entry) => ({ ...entry, status: "deleted", deletedAt: nowIso(), updatedAt: nowIso() }));
    }
    this.appendOperation("undo", { undoneOpId: op.id, undoneOp: op.op });
    this.rewriteAllMarkdown();
    return { status: "undone", op };
  }

  appendPending(candidate = {}) {
    this.initialize();
    const pending = {
      ...normalizeMemoryEntry(candidate),
      id: candidate.id && String(candidate.id).startsWith("pending_") ? candidate.id : makePendingId(),
      status: "pending",
      createdAt: candidate.createdAt || nowIso(),
      updatedAt: nowIso(),
    };
    appendJsonl(this.pendingFile, pending);
    this.appendOperation("pending", { pendingId: pending.id, candidate: pending });
    return pending;
  }

  approvePending(id) {
    const pending = this.readPending().find((entry) => entry.id === id && entry.status === "pending");
    if (!pending) {
      return { status: "missing" };
    }
    this.updatePendingEntry(id, (entry) => ({ ...entry, status: "approved", updatedAt: nowIso() }));
    const entry = normalizeMemoryEntry({ ...pending, id: makeMemoryId(), status: "active" });
    const result = this.appendMemory(entry, { allowConflict: false });
    this.appendOperation("approve", { pendingId: id, approvedId: result.entry?.id, status: result.status });
    return result;
  }

  rejectPending(id) {
    const result = this.updatePendingEntry(id, (entry) => ({ ...entry, status: "rejected", updatedAt: nowIso() }));
    if (result.updated) {
      this.appendOperation("reject", { pendingId: id, before: result.before, after: result.after });
      return result.after;
    }
    return null;
  }

  backupBeforeRewrite(file) {
    this.initialize();
    fs.mkdirSync(this.backupsDir, { recursive: true });
    const filePath = path.isAbsolute(file) ? file : path.join(this.memoryDir, file);
    const base = path.basename(filePath);
    const backupPath = path.join(this.backupsDir, `${timestampForFile()}-${base}`);
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, backupPath);
    } else {
      ensureFile(backupPath, "");
    }
    return backupPath;
  }

  pruneCategory(category) {
    const normalizedCategory = normalizeCategory(category);
    const filePath = this.resolveCategoryFile(normalizedCategory);
    const markdownBackup = this.backupBeforeRewrite(filePath);
    const indexBackup = this.backupBeforeRewrite(this.indexFile);
    const entries = this.readIndex();
    const kept = entries.filter((entry) => entry.category !== normalizedCategory || entry.status === "active");
    writeJsonl(this.indexFile, kept);
    this.rewriteCategoryMarkdown(normalizedCategory);
    this.appendOperation("prune", { category: normalizedCategory, markdownBackup, indexBackup });
    return { category: normalizedCategory, markdownBackup, indexBackup };
  }

  appendOperation(op, payload = {}) {
    this.initialize();
    const record = {
      id: `op_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      op,
      at: nowIso(),
      ...payload,
    };
    appendJsonl(this.opsFile, record);
    return record;
  }

  updateIndexEntry(id, updater) {
    const entries = this.readIndex();
    const index = entries.findIndex((entry) => entry.id === id);
    if (index < 0) {
      return { updated: false, before: null, after: null };
    }
    const before = entries[index];
    const after = updater({ ...before });
    entries[index] = after;
    writeJsonl(this.indexFile, entries);
    return { updated: true, before, after };
  }

  replaceIndexEntry(id, replacement) {
    const entries = this.readIndex();
    const index = entries.findIndex((entry) => entry.id === id);
    if (index < 0 || !replacement) {
      return false;
    }
    entries[index] = replacement;
    writeJsonl(this.indexFile, entries);
    return true;
  }

  updatePendingEntry(id, updater) {
    const entries = this.readPending();
    const index = entries.findIndex((entry) => entry.id === id);
    if (index < 0) {
      return { updated: false, before: null, after: null };
    }
    const before = entries[index];
    const after = updater({ ...before });
    entries[index] = after;
    writeJsonl(this.pendingFile, entries);
    return { updated: true, before, after };
  }

  rewriteAllMarkdown() {
    for (const category of Object.keys(CATEGORY_FILES)) {
      this.rewriteCategoryMarkdown(category);
    }
  }

  rewriteCategoryMarkdown(category) {
    const normalizedCategory = normalizeCategory(category);
    const filePath = this.resolveCategoryFile(normalizedCategory);
    const entries = this.readIndex({ category: normalizedCategory, status: "active" });
    const lines = [`# ${normalizedCategory}`, ""];
    for (const entry of entries) {
      lines.push(formatMarkdownEntry(entry));
    }
    fs.writeFileSync(filePath, `${lines.join("\n").trim()}\n`, "utf8");
  }

  resolveCategoryFile(category) {
    const normalized = normalizeCategory(category);
    return path.join(this.memoryDir, CATEGORY_FILES[normalized] || CATEGORY_FILES.facts);
  }
}

function normalizeMemoryEntry(entry = {}) {
  const priority = normalizePriority(entry.priority);
  const category = normalizeCategory(entry.category || PRIORITY_CATEGORY[priority] || "facts");
  const now = nowIso();
  const key = normalizeKey(entry.key || entry.text || serializeValue(entry.value).slice(0, 60));
  return {
    id: entry.id && String(entry.id).trim() ? String(entry.id).trim() : makeMemoryId(),
    category,
    key,
    value: entry.value === undefined ? String(entry.text || "") : entry.value,
    priority,
    scope: normalizeText(entry.scope) || "user",
    source: normalizeText(entry.source) || "wechat",
    createdAt: normalizeText(entry.createdAt) || now,
    updatedAt: normalizeText(entry.updatedAt) || now,
    status: normalizeText(entry.status) || "active",
    text: normalizeText(entry.text) || `${key}: ${serializeValue(entry.value)}`,
    turnId: normalizeText(entry.turnId),
    supersedes: normalizeText(entry.supersedes),
    deletedAt: normalizeText(entry.deletedAt),
    confidence: Number.isFinite(Number(entry.confidence)) ? Number(entry.confidence) : 1,
  };
}

function readJsonl(filePath) {
  ensureFile(filePath, "");
  const raw = fs.readFileSync(filePath, "utf8");
  const entries = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
      entries.push({ id: `invalid_${entries.length}`, status: "invalid", text: trimmed });
    }
  }
  return entries;
}

function writeJsonl(filePath, entries) {
  fs.writeFileSync(filePath, entries.map((entry) => JSON.stringify(entry)).join("\n") + (entries.length ? "\n" : ""), "utf8");
}

function appendJsonl(filePath, entry) {
  fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf8");
}

function appendMarkdownEntry(filePath, entry) {
  fs.appendFileSync(filePath, `\n${formatMarkdownEntry(entry)}\n`, "utf8");
}

function formatMarkdownEntry(entry) {
  const value = serializeValue(entry.value);
  return `- (${entry.id}) [${entry.priority}] ${entry.key}: ${value}\n  ${entry.text}`;
}

function matchesFilter(entry, filter = {}) {
  for (const [key, value] of Object.entries(filter || {})) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      if (!value.includes(entry[key])) return false;
      continue;
    }
    if (entry[key] !== value) return false;
  }
  return true;
}

function ensureFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content, "utf8");
  }
}

function normalizeCategory(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (CATEGORY_FILES[normalized]) return normalized;
  if (normalized === "preference") return "preferences";
  if (normalized === "fact") return "facts";
  if (normalized === "project") return "projects";
  if (normalized === "pattern") return "patterns";
  if (normalized === "relationship") return "relationships";
  if (normalized === "open_loop") return "open_loops";
  return "facts";
}

function normalizePriority(value) {
  const normalized = normalizeText(value).toLowerCase();
  return normalized || "soft_preference";
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "memory";
}

function normalizeSearch(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeComparable(value) {
  return serializeValue(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function serializeValue(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function makeMemoryId() {
  return `mem_${timestampForId()}_${crypto.randomBytes(2).toString("hex")}`;
}

function makePendingId() {
  return `pending_${timestampForId()}_${crypto.randomBytes(2).toString("hex")}`;
}

function timestampForId() {
  return new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function nowIso() {
  return new Date().toISOString();
}

module.exports = {
  MemoryService,
  CATEGORY_FILES,
  normalizeMemoryEntry,
};
