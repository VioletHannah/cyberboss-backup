const fs = require("fs");
const path = require("path");

class RecurringReminderStore {
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
          .map(normalizeRecurringReminder)
          .filter(Boolean)
          .sort(compareRecurringReminders),
      };
    } catch {
      this.state = { reminders: [] };
    }
  }

  save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
  }

  create(reminder) {
    this.load();
    const normalized = normalizeRecurringReminder(reminder);
    if (!normalized) {
      throw new Error("invalid recurring reminder");
    }
    this.state.reminders.push(normalized);
    this.state.reminders.sort(compareRecurringReminders);
    this.save();
    return normalized;
  }

  list({ accountId = "", senderId = "" } = {}) {
    this.load();
    const normalizedAccountId = normalizeText(accountId);
    const normalizedSenderId = normalizeText(senderId);
    return this.state.reminders.filter((reminder) => {
      if (normalizedAccountId && reminder.accountId !== normalizedAccountId) {
        return false;
      }
      if (normalizedSenderId && reminder.senderId !== normalizedSenderId) {
        return false;
      }
      return true;
    });
  }

  listDue(nowMs = Date.now(), accountId = "") {
    this.load();
    const normalizedAccountId = normalizeText(accountId);
    return this.state.reminders.filter((reminder) => (
      reminder.enabled
      && reminder.nextDueAtMs <= nowMs
      && (!normalizedAccountId || reminder.accountId === normalizedAccountId)
    ));
  }

  disable(id, { accountId = "", senderId = "" } = {}) {
    this.load();
    const normalizedId = normalizeText(id);
    const normalizedAccountId = normalizeText(accountId);
    const normalizedSenderId = normalizeText(senderId);
    let disabled = null;
    this.state.reminders = this.state.reminders.map((reminder) => {
      if (
        reminder.id !== normalizedId
        || (normalizedAccountId && reminder.accountId !== normalizedAccountId)
        || (normalizedSenderId && reminder.senderId !== normalizedSenderId)
      ) {
        return reminder;
      }
      disabled = {
        ...reminder,
        enabled: false,
        updatedAt: new Date().toISOString(),
      };
      return disabled;
    }).sort(compareRecurringReminders);
    if (disabled) {
      this.save();
    }
    return disabled;
  }

  markTriggered(id, { triggeredAtMs = Date.now(), nextDueAtMs = 0 } = {}) {
    this.load();
    const normalizedId = normalizeText(id);
    const normalizedNextDueAtMs = Number(nextDueAtMs);
    let updated = null;
    this.state.reminders = this.state.reminders.map((reminder) => {
      if (reminder.id !== normalizedId) {
        return reminder;
      }
      updated = {
        ...reminder,
        lastTriggeredAt: new Date(triggeredAtMs).toISOString(),
        nextDueAtMs: normalizedNextDueAtMs,
        updatedAt: new Date(triggeredAtMs).toISOString(),
      };
      return updated;
    }).sort(compareRecurringReminders);
    if (updated) {
      this.save();
    }
    return updated;
  }

  peekNextDueAtMs(accountId = "") {
    this.load();
    const normalizedAccountId = normalizeText(accountId);
    const next = this.state.reminders
      .filter((reminder) => reminder.enabled && (!normalizedAccountId || reminder.accountId === normalizedAccountId))
      .sort(compareRecurringReminders)[0];
    return Number.isFinite(next?.nextDueAtMs) ? next.nextDueAtMs : 0;
  }
}

function normalizeRecurringReminder(reminder) {
  if (!reminder || typeof reminder !== "object") {
    return null;
  }
  const id = normalizeText(reminder.id);
  const accountId = normalizeText(reminder.accountId);
  const senderId = normalizeText(reminder.senderId);
  const contextToken = normalizeText(reminder.contextToken);
  const text = normalizeText(reminder.text);
  const schedule = normalizeSchedule(reminder.schedule);
  const nextDueAtMs = Number(reminder.nextDueAtMs);
  const createdAt = normalizeIsoTime(reminder.createdAt) || new Date().toISOString();
  const updatedAt = normalizeIsoTime(reminder.updatedAt) || createdAt;
  const lastTriggeredAt = normalizeIsoTime(reminder.lastTriggeredAt);

  if (!id || !accountId || !senderId || !contextToken || !text || !schedule || !Number.isFinite(nextDueAtMs) || nextDueAtMs <= 0) {
    return null;
  }

  const normalized = {
    id,
    enabled: reminder.enabled !== false,
    accountId,
    senderId,
    contextToken,
    text,
    schedule,
    nextDueAtMs,
    createdAt,
    updatedAt,
  };
  if (lastTriggeredAt) {
    normalized.lastTriggeredAt = lastTriggeredAt;
  }
  return normalized;
}

function normalizeSchedule(schedule) {
  if (!schedule || typeof schedule !== "object") {
    return null;
  }
  const type = normalizeText(schedule.type);
  const time = normalizeDailyTime(schedule.time);
  const timezoneOffset = normalizeTimezoneOffset(schedule.timezoneOffset);
  if (type !== "daily" || !time || !timezoneOffset) {
    return null;
  }
  return { type, time, timezoneOffset };
}

function normalizeDailyTime(value) {
  const normalized = normalizeText(value);
  const match = normalized.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? `${match[1]}:${match[2]}` : "";
}

function normalizeTimezoneOffset(value) {
  const normalized = normalizeText(value);
  if (!/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(normalized)) {
    return "";
  }
  return normalized;
}

function compareRecurringReminders(left, right) {
  const leftTime = Number(left?.nextDueAtMs) || 0;
  const rightTime = Number(right?.nextDueAtMs) || 0;
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  return String(left?.id || "").localeCompare(String(right?.id || ""));
}

function normalizeIsoTime(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

module.exports = {
  RecurringReminderStore,
  normalizeDailyTime,
  normalizeTimezoneOffset,
};
