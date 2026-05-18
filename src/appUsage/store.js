const fs = require("fs");
const path = require("path");

const MAX_EVENTS = 500;

class AppUsageStore {
  constructor({ dir }) {
    this.dir = dir;
    this.currentStateFile = path.join(dir, "current_state.json");
    this.eventsFile = path.join(dir, "events.json");
    this.writeChain = Promise.resolve();
  }

  async initialize() {
    await fs.promises.mkdir(this.dir, { recursive: true });
    await this.ensureJsonFile(this.currentStateFile, {});
    await this.ensureJsonFile(this.eventsFile, []);
  }

  async readCurrentState() {
    await this.initialize();
    const parsed = await this.readJsonFile(this.currentStateFile, {});
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  }

  async writeCurrentState(state) {
    await this.initialize();
    return await this.enqueueWrite(async () => {
      await atomicWriteJson(this.currentStateFile, state && typeof state === "object" ? state : {});
    });
  }

  async readEvents({ cleanup = true } = {}) {
    await this.initialize();
    if (cleanup) {
      await this.cleanupOldEvents();
    }
    const parsed = await this.readJsonFile(this.eventsFile, []);
    return Array.isArray(parsed) ? parsed : [];
  }

  async appendEvent(event) {
    await this.initialize();
    return await this.enqueueWrite(async () => {
      const events = await this.readJsonFile(this.eventsFile, []);
      const normalizedEvents = Array.isArray(events) ? events : [];
      normalizedEvents.push(event);
      const cleaned = cleanupEventsForNow(normalizedEvents).slice(-MAX_EVENTS);
      await atomicWriteJson(this.eventsFile, cleaned);
      return cleaned;
    });
  }

  async cleanupOldEvents(now = new Date()) {
    await this.initialize();
    return await this.enqueueWrite(async () => {
      const events = await this.readJsonFile(this.eventsFile, []);
      const normalizedEvents = Array.isArray(events) ? events : [];
      const cleaned = cleanupEventsForNow(normalizedEvents, now).slice(-MAX_EVENTS);
      if (cleaned.length !== normalizedEvents.length) {
        await atomicWriteJson(this.eventsFile, cleaned);
      }
      return cleaned;
    });
  }

  async ensureJsonFile(filePath, fallback) {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
    } catch {
      await atomicWriteJson(filePath, fallback);
    }
  }

  async readJsonFile(filePath, fallback) {
    try {
      const raw = await fs.promises.readFile(filePath, "utf8");
      if (!raw.trim()) {
        return fallback;
      }
      return JSON.parse(raw);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return fallback;
      }
      throw error;
    }
  }

  async enqueueWrite(task) {
    const run = this.writeChain.then(task, task);
    this.writeChain = run.catch(() => {});
    return await run;
  }
}

function cleanupEventsForNow(events, now = new Date()) {
  const normalized = Array.isArray(events) ? events : [];
  if (now.getHours() < 3) {
    return normalized;
  }
  const todayKey = localDateKey(now);
  return normalized.filter((event) => {
    const date = parseDate(event?.timestamp || event?.created_at);
    return date && localDateKey(date) >= todayKey;
  });
}

async function atomicWriteJson(filePath, data) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const content = `${JSON.stringify(data, null, 2)}\n`;
  await fs.promises.writeFile(tmpPath, content, "utf8");
  await fs.promises.rename(tmpPath, filePath);
}

function parseDate(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

module.exports = {
  AppUsageStore,
  MAX_EVENTS,
};
