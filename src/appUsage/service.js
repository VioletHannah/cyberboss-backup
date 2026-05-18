const USING_TIMEOUT_MS = 5 * 60 * 1000;

const DEFAULT_DEVICE_ID = "default_phone";
const ALLOWED_EVENTS = new Set([
  "app_open",
  "app_close",
  "app_heartbeat",
  "screen_off",
  "screen_on",
  "untracked_app_foreground",
]);

class AppUsageService {
  constructor({ store }) {
    this.store = store;
  }

  async initialize() {
    await this.store.initialize();
  }

  async recordAppUsageEvent(input = {}) {
    const payload = normalizeEventInput(input);
    const validationError = validateEvent(payload);
    if (validationError) {
      return { ok: false, error: validationError };
    }

    const event = {
      device_id: payload.device_id,
      app_package: payload.app_package || null,
      app_name: payload.app_name || null,
      event: payload.event,
      timestamp: payload.timestamp,
      created_at: new Date().toISOString(),
    };
    await this.store.appendEvent(event);

    const previous = await this.store.readCurrentState();
    const nextState = buildNextState(previous, event);
    await this.store.writeCurrentState(nextState);
    return { ok: true };
  }

  async getCurrentAppUsage(args = {}) {
    await this.store.cleanupOldEvents();
    const deviceId = normalizeDeviceId(args.device_id);
    const state = await this.store.readCurrentState();
    if (!state || !state.device_id || state.device_id !== deviceId) {
      return {
        ok: true,
        device_id: deviceId,
        screen_status: "unknown",
        phone_status: "unknown",
        current_app: null,
        confidence: "none",
      };
    }
    return formatCurrentState(state, new Date());
  }

  async getRecentAppUsageEvents(args = {}) {
    const deviceId = normalizeDeviceId(args.device_id);
    const limit = clampLimit(args.limit, 20, 100);
    const events = await this.store.readEvents({ cleanup: true });
    return {
      ok: true,
      device_id: deviceId,
      events: events
        .filter((event) => event?.device_id === deviceId)
        .sort((left, right) => dateMs(right?.timestamp) - dateMs(left?.timestamp))
        .slice(0, limit)
        .map((event) => ({
          time: event.timestamp,
          app_package: event.app_package || null,
          app_name: event.app_name || null,
          event: event.event,
        })),
    };
  }

  async getAppUsageSummary(args = {}) {
    const deviceId = normalizeDeviceId(args.device_id);
    const now = new Date();
    const from = parseOptionalDate(args.from) || startOfLocalDay(now);
    const to = parseOptionalDate(args.to) || now;
    if (from.getTime() > to.getTime()) {
      return { ok: false, error: "from must be before to" };
    }

    const events = (await this.store.readEvents({ cleanup: true }))
      .filter((event) => event?.device_id === deviceId)
      .filter((event) => {
        const time = dateMs(event?.timestamp);
        return time >= from.getTime() && time <= to.getTime();
      })
      .sort((left, right) => dateMs(left?.timestamp) - dateMs(right?.timestamp));
    const summary = summarizeUsage(events, from, to);
    return {
      ok: true,
      device_id: deviceId,
      from: from.toISOString(),
      to: to.toISOString(),
      total_usage_minutes: summary.total_usage_minutes,
      apps: summary.apps,
    };
  }

  async getPhonePresenceStatus(args = {}) {
    const current = await this.getCurrentAppUsage(args);
    if (!current.ok) {
      return current;
    }
    const app = current.current_app || {};
    let presence = "unknown";
    let reason = "No app usage information is available.";
    let confidence = current.confidence || app.confidence || "none";

    if (current.screen_status === "off" || current.phone_status === "not_using_phone") {
      presence = "away";
      reason = "The phone screen is off.";
      confidence = "high";
    } else if (app.status === "using" && app.confidence === "high") {
      presence = classifyBusyApp(app) ? "busy" : "available";
      reason = classifyBusyApp(app)
        ? "A likely attention-heavy app is active recently."
        : "A monitored app is active recently.";
      confidence = "high";
    } else if (app.status === "untracked_app" && app.confidence === "medium") {
      presence = "maybe_available";
      reason = "The phone is in use, but the foreground app is untracked.";
      confidence = "medium";
    } else if (app.status === "screen_on") {
      presence = "maybe_available";
      reason = "The screen is on, but app usage is not known yet.";
      confidence = "low";
    } else if (app.status === "probably_closed") {
      presence = "away";
      reason = "The last app heartbeat is stale.";
      confidence = "low";
    }

    return {
      ok: true,
      device_id: current.device_id,
      presence,
      screen_status: current.screen_status,
      phone_status: current.phone_status,
      reason,
      confidence,
    };
  }
}

function normalizeEventInput(input) {
  const timestamp = normalizeText(input.timestamp) || new Date().toISOString();
  return {
    device_id: normalizeDeviceId(input.device_id),
    app_package: normalizeText(input.app_package),
    app_name: normalizeNullableText(input.app_name),
    event: normalizeText(input.event),
    timestamp,
  };
}

function validateEvent(payload) {
  if (!ALLOWED_EVENTS.has(payload.event)) {
    return `event must be one of: ${Array.from(ALLOWED_EVENTS).join(", ")}`;
  }
  if (Number.isNaN(new Date(payload.timestamp).getTime())) {
    return "timestamp must be a valid datetime";
  }
  if (["app_open", "app_close", "app_heartbeat"].includes(payload.event) && !payload.app_package) {
    return `app_package is required for ${payload.event}`;
  }
  return "";
}

function buildNextState(previous, event) {
  const base = previous && typeof previous === "object" ? previous : {};
  const timestamp = event.timestamp;
  const next = {
    ...base,
    device_id: event.device_id,
    last_event: event.event,
    updated_at: timestamp,
  };

  if (event.event === "app_open") {
    return {
      ...next,
      screen_status: "on",
      phone_status: "using_phone",
      app_package: event.app_package,
      app_name: event.app_name,
      status: "using",
      started_at: timestamp,
      last_seen: timestamp,
      ended_at: null,
    };
  }

  if (event.event === "app_heartbeat") {
    const sameApp = base.app_package && base.app_package === event.app_package;
    return {
      ...next,
      screen_status: "on",
      phone_status: "using_phone",
      app_package: event.app_package,
      app_name: event.app_name,
      status: "using",
      started_at: sameApp ? base.started_at || timestamp : timestamp,
      last_seen: timestamp,
      ended_at: null,
    };
  }

  if (event.event === "app_close") {
    return {
      ...next,
      screen_status: "on",
      phone_status: "using_phone",
      app_package: event.app_package || base.app_package || null,
      app_name: event.app_name || base.app_name || null,
      status: "closed",
      ended_at: timestamp,
    };
  }

  if (event.event === "screen_off") {
    return {
      ...next,
      screen_status: "off",
      phone_status: "not_using_phone",
      status: "screen_off",
      ended_at: timestamp,
    };
  }

  if (event.event === "screen_on") {
    return {
      ...next,
      screen_status: "on",
      phone_status: "maybe_using_phone",
      status: "screen_on",
      app_package: null,
      app_name: null,
      last_seen: timestamp,
      ended_at: null,
    };
  }

  return {
    ...next,
    screen_status: "on",
    phone_status: "using_phone",
    status: "untracked_app",
    app_package: null,
    app_name: event.app_name || "Untracked App",
    last_seen: timestamp,
  };
}

function formatCurrentState(state, now) {
  const timedOut = isTimedOut(state.last_seen, now);
  let status = state.status || "unknown";
  let phoneStatus = state.phone_status || "unknown";
  let confidence = "medium";

  if (status === "using") {
    if (timedOut) {
      status = "probably_closed";
      phoneStatus = "maybe_using_phone";
      confidence = "low";
    } else {
      phoneStatus = "using_phone";
      confidence = "high";
    }
  } else if (status === "untracked_app") {
    confidence = timedOut ? "low" : "medium";
    phoneStatus = timedOut ? "maybe_using_phone" : "using_phone";
    if (timedOut) {
      status = "probably_closed";
    }
  } else if (status === "screen_off") {
    phoneStatus = "not_using_phone";
    confidence = "high";
  } else if (status === "screen_on") {
    phoneStatus = "maybe_using_phone";
    confidence = "low";
  } else if (status === "closed") {
    phoneStatus = "maybe_using_phone";
    confidence = "low";
  } else {
    confidence = "none";
  }

  return {
    ok: true,
    device_id: state.device_id,
    screen_status: state.screen_status || "unknown",
    phone_status: phoneStatus,
    current_app: {
      app_package: state.app_package || null,
      app_name: state.app_name || null,
      status,
      last_event: state.last_event || null,
      started_at: state.started_at || null,
      last_seen: state.last_seen || null,
      ended_at: state.ended_at || null,
      confidence,
    },
    confidence,
  };
}

function summarizeUsage(events, from, to) {
  const byPackage = new Map();
  let active = null;

  for (const event of events) {
    const eventTime = new Date(event.timestamp);
    if (event.event === "app_open") {
      if (active) {
        addDuration(byPackage, active, Math.min(eventTime.getTime(), active.lastSeenMs || active.startMs + USING_TIMEOUT_MS));
      }
      active = {
        app_package: event.app_package,
        app_name: event.app_name,
        startMs: clampMs(eventTime.getTime(), from.getTime(), to.getTime()),
        lastSeenMs: null,
      };
      continue;
    }
    if (event.event === "app_heartbeat" && active && active.app_package === event.app_package) {
      active.lastSeenMs = eventTime.getTime();
      if (event.app_name) {
        active.app_name = event.app_name;
      }
      continue;
    }
    if (event.event === "app_close" && active && active.app_package === event.app_package) {
      addDuration(byPackage, active, eventTime.getTime());
      active = null;
      continue;
    }
    if (event.event === "screen_off" && active) {
      addDuration(byPackage, active, eventTime.getTime());
      active = null;
    }
  }

  if (active) {
    const fallbackEndMs = active.lastSeenMs || active.startMs + USING_TIMEOUT_MS;
    addDuration(byPackage, active, Math.min(fallbackEndMs, to.getTime()));
  }

  const apps = Array.from(byPackage.values())
    .map((entry) => ({
      app_package: entry.app_package,
      app_name: entry.app_name || null,
      usage_minutes: Math.round(entry.usageMs / 60000),
    }))
    .filter((entry) => entry.usage_minutes > 0)
    .sort((left, right) => right.usage_minutes - left.usage_minutes);
  return {
    total_usage_minutes: apps.reduce((sum, app) => sum + app.usage_minutes, 0),
    apps,
  };
}

function addDuration(byPackage, active, endMs) {
  const clampedEnd = Math.max(active.startMs, endMs);
  const usageMs = clampedEnd - active.startMs;
  if (usageMs <= 0 || !active.app_package) {
    return;
  }
  const current = byPackage.get(active.app_package) || {
    app_package: active.app_package,
    app_name: active.app_name || null,
    usageMs: 0,
  };
  current.usageMs += usageMs;
  if (active.app_name) {
    current.app_name = active.app_name;
  }
  byPackage.set(active.app_package, current);
}

function classifyBusyApp(app) {
  const haystack = `${app.app_package || ""} ${app.app_name || ""}`.toLowerCase();
  return [
    "youtube",
    "netflix",
    "bilibili",
    "tiktok",
    "douyin",
    "game",
    "wechat",
    "weixin",
    "telegram",
    "discord",
    "instagram",
    "twitter",
    "xhs",
  ].some((keyword) => haystack.includes(keyword));
}

function isTimedOut(value, now) {
  const ms = dateMs(value);
  return !ms || now.getTime() - ms > USING_TIMEOUT_MS;
}

function normalizeDeviceId(value) {
  return normalizeText(value) || DEFAULT_DEVICE_ID;
}

function normalizeNullableText(value) {
  const text = normalizeText(value);
  return text || null;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clampLimit(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function dateMs(value) {
  if (typeof value !== "string" || !value.trim()) {
    return 0;
  }
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseOptionalDate(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function clampMs(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = {
  AppUsageService,
  DEFAULT_DEVICE_ID,
  ALLOWED_EVENTS,
  USING_TIMEOUT_MS,
};
