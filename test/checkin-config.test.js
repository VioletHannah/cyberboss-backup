const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  CheckinConfigStore,
  DEFAULT_MIN_INTERVAL_MS,
  DEFAULT_MAX_INTERVAL_MS,
  DEFAULT_SLEEP_MIN_INTERVAL_MS,
  DEFAULT_SLEEP_MAX_INTERVAL_MS,
  isSleepHour,
  parseCheckinRangeMinutes,
  parseSleepHourRange,
  resolveDefaultSleepRange,
} = require("../src/core/checkin-config-store");
const { CyberbossApp, detectSleepIntent } = require("../src/core/app");

function createStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cyberboss-checkin-test-"));
  return new CheckinConfigStore({ filePath: path.join(dir, "checkin-config.json") });
}

test("parseCheckinRangeMinutes accepts min-max minute ranges", () => {
  assert.deepEqual(parseCheckinRangeMinutes("7-21"), { minMinutes: 7, maxMinutes: 21 });
  assert.deepEqual(parseCheckinRangeMinutes("5 - 10"), { minMinutes: 5, maxMinutes: 10 });
  assert.equal(parseCheckinRangeMinutes("10-3"), null);
  assert.equal(parseCheckinRangeMinutes("abc"), null);
});

test("parseSleepHourRange accepts Beijing hour ranges", () => {
  assert.deepEqual(parseSleepHourRange("1-8"), { sleepHourStart: 1, sleepHourEnd: 8 });
  assert.deepEqual(parseSleepHourRange("22 - 7"), { sleepHourStart: 22, sleepHourEnd: 7 });
  assert.equal(parseSleepHourRange("8-8"), null);
  assert.equal(parseSleepHourRange("24-8"), null);
  assert.equal(parseSleepHourRange("abc"), null);
});

test("checkin config store falls back to defaults and persists overrides", () => {
  const store = createStore();
  assert.deepEqual(store.getRange(), {
    minIntervalMs: DEFAULT_MIN_INTERVAL_MS,
    maxIntervalMs: DEFAULT_MAX_INTERVAL_MS,
  });
  store.setRange({ minIntervalMs: 4 * 60_000, maxIntervalMs: 25 * 60_000 });
  assert.deepEqual(store.getRange(), {
    minIntervalMs: 4 * 60_000,
    maxIntervalMs: 25 * 60_000,
  });
});

test("checkin config store persists sleep range and sleeping state independently", () => {
  const store = createStore();
  assert.deepEqual(store.getSleepRange(), {
    minIntervalMs: DEFAULT_SLEEP_MIN_INTERVAL_MS,
    maxIntervalMs: DEFAULT_SLEEP_MAX_INTERVAL_MS,
  });

  store.setSleeping(true, new Date("2026-05-18T02:30:00.000Z"));
  store.setSleepHours({ sleepHourStart: 1, sleepHourEnd: 8 });
  store.setRange({ minIntervalMs: 4 * 60_000, maxIntervalMs: 25 * 60_000 });
  assert.equal(store.isSleeping(), true);

  const reloaded = new CheckinConfigStore({ filePath: store.filePath });
  assert.deepEqual(reloaded.getRange(), {
    minIntervalMs: 4 * 60_000,
    maxIntervalMs: 25 * 60_000,
  });
  assert.equal(reloaded.isSleeping(), true);
  assert.deepEqual(reloaded.getSleepHours(), {
    sleepHourStart: 1,
    sleepHourEnd: 8,
  });
});

test("checkin config store reads persisted sleep interval overrides", () => {
  const store = createStore();
  fs.writeFileSync(store.filePath, JSON.stringify({
    minIntervalMs: 3 * 60_000,
    maxIntervalMs: 60 * 60_000,
    sleepMinIntervalMs: 5 * 60 * 60_000,
    sleepMaxIntervalMs: 7 * 60 * 60_000,
    sleepHourStart: 22,
    sleepHourEnd: 7,
  }, null, 2));
  assert.deepEqual(store.getSleepRange(), {
    minIntervalMs: 5 * 60 * 60_000,
    maxIntervalMs: 7 * 60 * 60_000,
  });
  assert.deepEqual(store.getSleepHours(), {
    sleepHourStart: 22,
    sleepHourEnd: 7,
  });
});

test("resolveDefaultSleepRange reads sleep interval environment variables", () => {
  assert.deepEqual(resolveDefaultSleepRange({
    CYBERBOSS_CHECKIN_SLEEP_MIN_INTERVAL_MS: String(2 * 60 * 60_000),
    CYBERBOSS_CHECKIN_SLEEP_MAX_INTERVAL_MS: String(3 * 60 * 60_000),
  }), {
    minIntervalMs: 2 * 60 * 60_000,
    maxIntervalMs: 3 * 60 * 60_000,
  });
});

test("isSleepHour uses configurable Asia Shanghai hours", () => {
  assert.equal(isSleepHour(new Date("2026-05-18T17:00:00.000Z")), true);
  assert.equal(isSleepHour(new Date("2026-05-19T00:00:00.000Z")), false);
  assert.equal(isSleepHour(new Date("2026-05-18T17:00:00.000Z"), { sleepHourStart: 1, sleepHourEnd: 8 }), true);
  assert.equal(isSleepHour(new Date("2026-05-18T16:30:00.000Z"), { sleepHourStart: 1, sleepHourEnd: 8 }), false);
});

test("detectSleepIntent matches configured sleep phrases case-insensitively", () => {
  assert.equal(detectSleepIntent("我准备睡觉了"), true);
  assert.equal(detectSleepIntent("GOOD NIGHT"), true);
  assert.equal(detectSleepIntent("going to bed now"), true);
  assert.equal(detectSleepIntent("还在处理事情"), false);
});

test("handleSleeptimeCommand stores the new sleep hours and replies in English", async () => {
  const sent = [];
  const store = createStore();
  const appLike = {
    checkinConfigStore: store,
    channelAdapter: {
      async sendText(payload) {
        sent.push(payload);
      },
    },
  };

  await CyberbossApp.prototype.handleSleeptimeCommand.call(appLike, {
    senderId: "user-1",
    contextToken: "ctx-1",
  }, {
    args: "1-8",
  });

  assert.deepEqual(store.getSleepHours(), {
    sleepHourStart: 1,
    sleepHourEnd: 8,
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].text, "✅ Sleep check-in hours reset to 1-8 Beijing time and will apply on the next polling cycle.");
});

test("handleCheckinCommand stores the new range and replies in English", async () => {
  const sent = [];
  const store = createStore();
  const appLike = {
    checkinConfigStore: store,
    channelAdapter: {
      async sendText(payload) {
        sent.push(payload);
      },
    },
  };

  await CyberbossApp.prototype.handleCheckinCommand.call(appLike, {
    senderId: "user-1",
    contextToken: "ctx-1",
  }, {
    args: "7-21",
  });

  assert.deepEqual(store.getRange(), {
    minIntervalMs: 7 * 60_000,
    maxIntervalMs: 21 * 60_000,
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].text, "✅ Check-in interval reset to 7-21 minutes and will apply on the next polling cycle.");
});

test("incoming sleep intent is confirmed when app usage has no active change", async () => {
  const store = createStore();
  const appLike = {
    checkinConfigStore: store,
    pendingSleepIntentTimer: null,
    projectServices: {
      appUsage: {
        async getRecentAppUsageEvents() {
          return {
            ok: true,
            events: [
              { time: "2026-05-18T15:31:00.000Z", event: "screen_off" },
            ],
          };
        },
      },
    },
    clearPendingSleepIntentTimer: CyberbossApp.prototype.clearPendingSleepIntentTimer,
    shouldConfirmSleepIntent: CyberbossApp.prototype.shouldConfirmSleepIntent,
  };

  assert.equal(await CyberbossApp.prototype.shouldConfirmSleepIntent.call(appLike, "2026-05-18T15:30:00.000Z"), true);
});

test("incoming sleep intent is rejected when app usage changes after goodnight", async () => {
  const store = createStore();
  const appLike = {
    checkinConfigStore: store,
    pendingSleepIntentTimer: null,
    projectServices: {
      appUsage: {
        async getRecentAppUsageEvents() {
          return {
            ok: true,
            events: [
              { time: "2026-05-18T15:31:00.000Z", event: "app_open" },
            ],
          };
        },
      },
    },
  };

  assert.equal(await CyberbossApp.prototype.shouldConfirmSleepIntent.call(appLike, "2026-05-18T15:30:00.000Z"), false);
});

test("incoming non sleep message wakes persisted checkin sleep mode", () => {
  const store = createStore();
  store.setSleeping(true, new Date("2026-05-18T15:30:00.000Z"));
  const appLike = {
    checkinConfigStore: store,
    pendingSleepIntentTimer: null,
    clearPendingSleepIntentTimer: CyberbossApp.prototype.clearPendingSleepIntentTimer,
  };

  CyberbossApp.prototype.handleCheckinSleepStateForIncomingMessage.call(appLike, {
    text: "早上好",
  });

  assert.equal(store.isSleeping(), false);
});

test("handleChunkCommand reports current value and persists updates through the channel adapter", async () => {
  const sent = [];
  let minChunk = 20;
  const appLike = {
    channelAdapter: {
      getMinChunkChars() {
        return minChunk;
      },
      setMinChunkChars(value) {
        minChunk = value;
        return minChunk;
      },
      async sendText(payload) {
        sent.push(payload);
      },
    },
  };

  await CyberbossApp.prototype.handleChunkCommand.call(appLike, {
    senderId: "user-1",
    contextToken: "ctx-1",
  }, {
    args: "",
  });
  await CyberbossApp.prototype.handleChunkCommand.call(appLike, {
    senderId: "user-1",
    contextToken: "ctx-1",
  }, {
    args: "50",
  });

  assert.equal(sent[0].text, "💡 Current minimum merge chunk is 20 characters. Usage: /chunk <number> (e.g. /chunk 50)");
  assert.equal(sent[1].text, "✅ Minimum merge chunk set to 50 characters. Shorter fragments will be merged into one message up to this size.");
  assert.equal(minChunk, 50);
});
