const APP_USAGE_TOOLS = [
  {
    name: "get_current_app_usage",
    description: "Get the current phone/app usage state for a device.",
    inputSchema: {
      type: "object",
      properties: {
        device_id: { type: "string", description: "Optional device id, default vivos30promini." },
      },
      additionalProperties: false,
    },
    async handler({ services, args }) {
      return await callAppUsageService(services, "getCurrentAppUsage", args);
    },
  },
  {
    name: "get_recent_app_usage_events",
    description: "Get recent app usage events for a device in reverse chronological order.",
    inputSchema: {
      type: "object",
      properties: {
        device_id: { type: "string", description: "Optional device id, default vivos30promini." },
        limit: { type: "integer", description: "Optional event limit, default 20, max 100." },
      },
      additionalProperties: false,
    },
    async handler({ services, args }) {
      return await callAppUsageService(services, "getRecentAppUsageEvents", args);
    },
  },
  {
    name: "get_app_usage_summary",
    description: "Summarize retained app usage events by app and estimated usage minutes.",
    inputSchema: {
      type: "object",
      properties: {
        device_id: { type: "string", description: "Optional device id, default vivos30promini." },
        from: { type: "string", description: "Optional start datetime. Defaults to today 00:00 local time." },
        to: { type: "string", description: "Optional end datetime. Defaults to now." },
      },
      additionalProperties: false,
    },
    async handler({ services, args }) {
      return await callAppUsageService(services, "getAppUsageSummary", args);
    },
  },
  {
    name: "get_phone_presence_status",
    description: "Quickly estimate whether the user is available, busy, away, or unknown based on phone state.",
    inputSchema: {
      type: "object",
      properties: {
        device_id: { type: "string", description: "Optional device id, default vivos30promini." },
      },
      additionalProperties: false,
    },
    async handler({ services, args }) {
      return await callAppUsageService(services, "getPhonePresenceStatus", args);
    },
  },
];

async function callAppUsageService(services, method, args) {
  try {
    if (!services?.appUsage || typeof services.appUsage[method] !== "function") {
      return { ok: false, error: "app usage service is not available" };
    }
    return await services.appUsage[method](args || {});
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error || "unknown error"),
    };
  }
}

module.exports = { APP_USAGE_TOOLS };
