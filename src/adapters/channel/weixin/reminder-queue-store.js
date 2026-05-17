const fs = require("fs");
const path = require("path");

class ReminderQueueStore {
  constructor({ filePath }) {
    this.filePath = filePath;
    this.state = { reminders: [] };
    this.ensureParentDirectory();
    this.load();
  }

  ensureParentDirectory() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  load() {
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      const reminders = Array.isArray(parsed?.reminders) ? parsed.reminders : [];
      this.state = {
        reminders: reminders
          .map(normalizeReminder)
          .filter(Boolean)
          .sort((left, right) => left.dueAtMs - right.dueAtMs),
      };
    } catch {
      this.state = { reminders: [] };
    }
  }

  save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
  }

  enqueue(reminder) {
    this.load();
    const normalized = normalizeReminder(reminder);
    if (!normalized) {
      throw new Error("invalid reminder");
    }
    this.state.reminders.push(normalized);
    this.state.reminders.sort((left, right) => left.dueAtMs - right.dueAtMs);
    this.save();
    return normalized;
  }

  acknowledgeForSender(accountId, senderId, ackedAt = new Date().toISOString()) {
    this.load();
    const normalizedAccountId = normalizeText(accountId);
    const normalizedSenderId = normalizeText(senderId);
    if (!normalizedAccountId || !normalizedSenderId) {
      return [];
    }

    const acknowledged = [];
    const pending = [];
    for (const reminder of this.state.reminders) {
      if (
        reminder.kind === "interactive"
        && reminder.accountId === normalizedAccountId
        && reminder.senderId === normalizedSenderId
      ) {
        acknowledged.push({
          ...reminder,
          ackedAt: normalizeIsoTime(ackedAt) || new Date().toISOString(),
        });
      } else {
        pending.push(reminder);
      }
    }

    if (acknowledged.length) {
      this.state.reminders = pending;
      this.save();
    }
    return acknowledged;
  }

  listDue(nowMs = Date.now()) {
    this.load();
    const due = [];
    const pending = [];

    for (const reminder of this.state.reminders) {
      if (reminder.dueAtMs <= nowMs) {
        due.push(reminder);
      } else {
        pending.push(reminder);
      }
    }

    if (due.length) {
      this.state.reminders = pending;
      this.save();
    }

    return due;
  }

  peekNextDueAtMs() {
    this.load();
    const first = this.state.reminders[0];
    return Number.isFinite(first?.dueAtMs) ? first.dueAtMs : 0;
  }
}

function normalizeReminder(reminder) {
  if (!reminder || typeof reminder !== "object") {
    return null;
  }
  const id = typeof reminder.id === "string" ? reminder.id.trim() : "";
  const accountId = typeof reminder.accountId === "string" ? reminder.accountId.trim() : "";
  const senderId = typeof reminder.senderId === "string" ? reminder.senderId.trim() : "";
  const contextToken = typeof reminder.contextToken === "string" ? reminder.contextToken.trim() : "";
  const text = typeof reminder.text === "string" ? reminder.text.trim() : "";
  const dueAtMs = Number(reminder.dueAtMs);
  const createdAt = typeof reminder.createdAt === "string" ? reminder.createdAt.trim() : "";
  const kind = normalizeReminderKind(reminder.kind);
  const promptCount = normalizeNonNegativeInteger(reminder.promptCount);
  const intervalMs = normalizePositiveInteger(reminder.intervalMs);
  const maxTimes = normalizePositiveInteger(reminder.maxTimes);
  const lastPromptAt = normalizeIsoTime(reminder.lastPromptAt);
  const ackedAt = normalizeIsoTime(reminder.ackedAt);
  if (!id || !accountId || !senderId || !contextToken || !text || !Number.isFinite(dueAtMs) || dueAtMs <= 0) {
    return null;
  }
  const normalized = {
    id,
    accountId,
    senderId,
    contextToken,
    text,
    dueAtMs,
    createdAt: createdAt || new Date().toISOString(),
  };
  if (kind === "interactive") {
    return {
      ...normalized,
      kind,
      promptCount,
      intervalMs,
      maxTimes,
      lastPromptAt,
      ackedAt,
    };
  }
  return {
    ...normalized,
    kind,
  };
}

function normalizeReminderKind(value) {
  return value === "interactive" ? "interactive" : "system";
}

function normalizeIsoTime(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function normalizePositiveInteger(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeNonNegativeInteger(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

module.exports = { ReminderQueueStore };
