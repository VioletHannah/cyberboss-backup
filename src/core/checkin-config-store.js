const fs = require("fs");
const path = require("path");

const DEFAULT_MIN_INTERVAL_MS = 3 * 60_000;
const DEFAULT_MAX_INTERVAL_MS = 60 * 60_000;
const DEFAULT_SLEEP_MIN_INTERVAL_MS = 4 * 60 * 60_000;
const DEFAULT_SLEEP_MAX_INTERVAL_MS = 6 * 60 * 60_000;
const SLEEP_HOUR_START = 0;
const SLEEP_HOUR_END = 8;
const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

class CheckinConfigStore {
  constructor({ filePath }) {
    this.filePath = filePath;
    this.state = {};
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
      this.state = normalizePersistedState(parsed);
    } catch {
      this.state = {};
    }
  }

  save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
  }

  getRange(fallbackRange = resolveDefaultCheckinRange()) {
    this.load();
    return normalizeIntervalRange(this.state, fallbackRange);
  }

  setRange(range) {
    const normalized = normalizeIntervalRange(range);
    this.load();
    this.state = {
      ...this.state,
      ...normalized,
    };
    this.save();
    return { ...normalized };
  }

  getSleepRange(fallbackRange = resolveDefaultSleepRange()) {
    this.load();
    const fallback = normalizeSleepIntervalRange(fallbackRange);
    const minIntervalMs = normalizePositiveInteger(this.state.sleepMinIntervalMs) || fallback.minIntervalMs;
    const maxIntervalMs = Math.max(
      minIntervalMs,
      normalizePositiveInteger(this.state.sleepMaxIntervalMs) || fallback.maxIntervalMs
    );
    return { minIntervalMs, maxIntervalMs };
  }

  isSleeping() {
    this.load();
    return this.state.sleeping === true;
  }

  setSleeping(sleeping, changedAt = new Date()) {
    this.load();
    const nextSleeping = sleeping === true;
    this.state = {
      ...this.state,
      sleeping: nextSleeping,
      sleepStateChangedAt: normalizeIsoTimestamp(changedAt) || new Date().toISOString(),
    };
    this.save();
    return {
      sleeping: this.state.sleeping,
      sleepStateChangedAt: this.state.sleepStateChangedAt,
    };
  }
}

function resolveDefaultCheckinRange(env = process.env) {
  const minIntervalMs = readIntervalMs(env?.CYBERBOSS_CHECKIN_MIN_INTERVAL_MS, DEFAULT_MIN_INTERVAL_MS);
  const maxIntervalMs = Math.max(
    minIntervalMs,
    readIntervalMs(env?.CYBERBOSS_CHECKIN_MAX_INTERVAL_MS, DEFAULT_MAX_INTERVAL_MS)
  );
  return { minIntervalMs, maxIntervalMs };
}

function resolveDefaultSleepRange(env = process.env) {
  const minIntervalMs = readIntervalMs(env?.CYBERBOSS_CHECKIN_SLEEP_MIN_INTERVAL_MS, DEFAULT_SLEEP_MIN_INTERVAL_MS);
  const maxIntervalMs = Math.max(
    minIntervalMs,
    readIntervalMs(env?.CYBERBOSS_CHECKIN_SLEEP_MAX_INTERVAL_MS, DEFAULT_SLEEP_MAX_INTERVAL_MS)
  );
  return { minIntervalMs, maxIntervalMs };
}

function parseCheckinRangeMinutes(input) {
  const normalized = typeof input === "string" ? input.trim() : "";
  const match = normalized.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) {
    return null;
  }
  const minMinutes = Number.parseInt(match[1], 10);
  const maxMinutes = Number.parseInt(match[2], 10);
  if (!Number.isFinite(minMinutes) || !Number.isFinite(maxMinutes) || minMinutes <= 0 || maxMinutes <= 0 || maxMinutes < minMinutes) {
    return null;
  }
  return { minMinutes, maxMinutes };
}

function normalizePersistedState(value) {
  if (!value || typeof value !== "object") {
    return {};
  }
  const range = normalizePersistedRange(value) || {};
  const sleepMinIntervalMs = normalizePositiveInteger(value.sleepMinIntervalMs);
  const sleepMaxIntervalMs = normalizePositiveInteger(value.sleepMaxIntervalMs);
  const state = { ...range };
  if (sleepMinIntervalMs) {
    state.sleepMinIntervalMs = sleepMinIntervalMs;
    state.sleepMaxIntervalMs = Math.max(sleepMinIntervalMs, sleepMaxIntervalMs || sleepMinIntervalMs);
  } else if (sleepMaxIntervalMs) {
    state.sleepMinIntervalMs = sleepMaxIntervalMs;
    state.sleepMaxIntervalMs = sleepMaxIntervalMs;
  }
  if (value.sleeping === true || value.sleeping === false) {
    state.sleeping = value.sleeping;
  }
  const changedAt = normalizeIsoTimestamp(value.sleepStateChangedAt);
  if (changedAt) {
    state.sleepStateChangedAt = changedAt;
  }
  return state;
}

function normalizePersistedRange(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const minIntervalMs = normalizePositiveInteger(value.minIntervalMs);
  const maxIntervalMs = normalizePositiveInteger(value.maxIntervalMs);
  if (!minIntervalMs || !maxIntervalMs) {
    return null;
  }
  return {
    minIntervalMs,
    maxIntervalMs: Math.max(minIntervalMs, maxIntervalMs),
  };
}

function normalizeSleepIntervalRange(value) {
  return normalizeIntervalRange(value, {
    minIntervalMs: DEFAULT_SLEEP_MIN_INTERVAL_MS,
    maxIntervalMs: DEFAULT_SLEEP_MAX_INTERVAL_MS,
  });
}

function normalizeIntervalRange(value, fallbackRange = resolveDefaultCheckinRange()) {
  const fallback = normalizePersistedRange(fallbackRange) || {
    minIntervalMs: DEFAULT_MIN_INTERVAL_MS,
    maxIntervalMs: DEFAULT_MAX_INTERVAL_MS,
  };
  const normalized = normalizePersistedRange(value);
  return normalized || fallback;
}

function isSleepHour(date = new Date()) {
  const hour = getShanghaiHour(date);
  if (SLEEP_HOUR_START === SLEEP_HOUR_END) {
    return false;
  }
  if (SLEEP_HOUR_START < SLEEP_HOUR_END) {
    return hour >= SLEEP_HOUR_START && hour < SLEEP_HOUR_END;
  }
  return hour >= SLEEP_HOUR_START || hour < SLEEP_HOUR_END;
}

function getShanghaiHour(date) {
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().getHours();
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SHANGHAI_TIME_ZONE,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(parsed);
  const rawHour = parts.find((part) => part.type === "hour")?.value || "";
  const hour = Number.parseInt(rawHour, 10);
  return Number.isFinite(hour) ? hour % 24 : 0;
}

function normalizeIsoTimestamp(value) {
  const date = value instanceof Date ? value : new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString();
}

function normalizePositiveInteger(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function readIntervalMs(rawValue, fallback) {
  const parsed = Number.parseInt(String(rawValue || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

module.exports = {
  CheckinConfigStore,
  DEFAULT_MIN_INTERVAL_MS,
  DEFAULT_MAX_INTERVAL_MS,
  DEFAULT_SLEEP_MIN_INTERVAL_MS,
  DEFAULT_SLEEP_MAX_INTERVAL_MS,
  SLEEP_HOUR_START,
  SLEEP_HOUR_END,
  isSleepHour,
  parseCheckinRangeMinutes,
  resolveDefaultCheckinRange,
  resolveDefaultSleepRange,
};
