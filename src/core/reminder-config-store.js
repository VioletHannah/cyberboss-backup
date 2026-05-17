const fs = require("fs");
const path = require("path");

const DEFAULT_REMINDER_INTERVAL_MS = 3 * 60_000;
const DEFAULT_REMINDER_MAX_TIMES = 6;

class ReminderConfigStore {
  constructor({ filePath }) {
    this.filePath = filePath;
    this.state = { accounts: {} };
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
      this.state = normalizeState(parsed);
    } catch {
      this.state = { accounts: {} };
    }
  }

  save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
  }

  getAccountConfig(accountId) {
    this.load();
    const normalizedAccountId = normalizeText(accountId);
    const stored = normalizedAccountId ? this.state.accounts[normalizedAccountId] : null;
    return normalizeConfig(stored);
  }

  setAccountInterval(accountId, intervalMs) {
    const normalizedAccountId = normalizeText(accountId);
    if (!normalizedAccountId) {
      throw new Error("accountId is required");
    }
    const normalizedIntervalMs = normalizePositiveInteger(intervalMs);
    if (!normalizedIntervalMs) {
      throw new Error("intervalMs must be positive");
    }
    this.load();
    const current = normalizeConfig(this.state.accounts[normalizedAccountId]);
    const updated = {
      ...current,
      intervalMs: normalizedIntervalMs,
    };
    this.state.accounts[normalizedAccountId] = updated;
    this.save();
    return { ...updated };
  }

  setAccountMaxTimes(accountId, maxTimes) {
    const normalizedAccountId = normalizeText(accountId);
    if (!normalizedAccountId) {
      throw new Error("accountId is required");
    }
    const normalizedMaxTimes = normalizePositiveInteger(maxTimes);
    if (!normalizedMaxTimes) {
      throw new Error("maxTimes must be positive");
    }
    this.load();
    const current = normalizeConfig(this.state.accounts[normalizedAccountId]);
    const updated = {
      ...current,
      maxTimes: normalizedMaxTimes,
    };
    this.state.accounts[normalizedAccountId] = updated;
    this.save();
    return { ...updated };
  }
}

function normalizeState(value) {
  const accounts = value && typeof value === "object" && value.accounts && typeof value.accounts === "object"
    ? value.accounts
    : {};
  const normalizedAccounts = {};
  for (const [accountId, config] of Object.entries(accounts)) {
    const normalizedAccountId = normalizeText(accountId);
    if (!normalizedAccountId) {
      continue;
    }
    normalizedAccounts[normalizedAccountId] = normalizeConfig(config);
  }
  return { accounts: normalizedAccounts };
}

function normalizeConfig(value = {}) {
  const intervalMs = normalizePositiveInteger(value?.intervalMs) || DEFAULT_REMINDER_INTERVAL_MS;
  const maxTimes = normalizePositiveInteger(value?.maxTimes) || DEFAULT_REMINDER_MAX_TIMES;
  return { intervalMs, maxTimes };
}

function normalizePositiveInteger(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

module.exports = {
  ReminderConfigStore,
  DEFAULT_REMINDER_INTERVAL_MS,
  DEFAULT_REMINDER_MAX_TIMES,
};
