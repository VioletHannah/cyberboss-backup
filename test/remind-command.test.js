const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { ReminderQueueStore } = require("../src/adapters/channel/weixin/reminder-queue-store");
const { ReminderConfigStore } = require("../src/core/reminder-config-store");
const { CyberbossApp } = require("../src/core/app");

function createStores() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cyberboss-remind-test-"));
  return {
    dir,
    queue: new ReminderQueueStore({ filePath: path.join(dir, "reminder-queue.json") }),
    config: new ReminderConfigStore({ filePath: path.join(dir, "reminder-config.json") }),
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

test("handleRemindCommand creates an interactive reminder with account config snapshot", async () => {
  const { dir, queue, config } = createStores();
  const sent = [];
  config.setAccountInterval("acc-1", 10 * 60_000);
  config.setAccountMaxTimes("acc-1", 4);

  const appLike = Object.assign(Object.create(CyberbossApp.prototype), {
    activeAccountId: "acc-1",
    reminderQueue: queue,
    reminderConfigStore: config,
    channelAdapter: {
      async sendText(payload) {
        sent.push(payload);
      },
    },
  });

  await CyberbossApp.prototype.handleRemindCommand.call(appLike, {
    accountId: "acc-1",
    senderId: "user-1",
    contextToken: "ctx-1",
  }, {
    args: "5m 睡觉",
  });

  const reminders = readJson(path.join(dir, "reminder-queue.json")).reminders;
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].kind, "interactive");
  assert.equal(reminders[0].accountId, "acc-1");
  assert.equal(reminders[0].senderId, "user-1");
  assert.equal(reminders[0].text, "睡觉");
  assert.equal(reminders[0].intervalMs, 10 * 60_000);
  assert.equal(reminders[0].maxTimes, 4);
  assert.equal(sent[0].text, "✅ Reminder set for 5m later: 睡觉");
});

test("handleRemindCommand persists interval and maxtimes per account", async () => {
  const { config, queue } = createStores();
  const sent = [];
  const appLike = Object.assign(Object.create(CyberbossApp.prototype), {
    activeAccountId: "acc-1",
    reminderQueue: queue,
    reminderConfigStore: config,
    channelAdapter: {
      async sendText(payload) {
        sent.push(payload);
      },
    },
  });

  await CyberbossApp.prototype.handleRemindCommand.call(appLike, {
    accountId: "acc-1",
    senderId: "user-1",
    contextToken: "ctx-1",
  }, {
    args: "interval 10m",
  });
  await CyberbossApp.prototype.handleRemindCommand.call(appLike, {
    accountId: "acc-1",
    senderId: "user-1",
    contextToken: "ctx-1",
  }, {
    args: "maxtimes 4",
  });

  assert.deepEqual(config.getAccountConfig("acc-1"), {
    intervalMs: 10 * 60_000,
    maxTimes: 4,
  });
  assert.equal(sent[0].text, "✅ Reminder follow-up interval set to 10m.");
  assert.equal(sent[1].text, "✅ Reminder max follow-up times set to 4.");
});

test("handleRemindCommand rejects invalid reminder inputs with usage", async () => {
  const { config, queue } = createStores();
  const sent = [];
  const appLike = Object.assign(Object.create(CyberbossApp.prototype), {
    activeAccountId: "acc-1",
    reminderQueue: queue,
    reminderConfigStore: config,
    channelAdapter: {
      async sendText(payload) {
        sent.push(payload);
      },
    },
  });

  await CyberbossApp.prototype.handleRemindCommand.call(appLike, {
    accountId: "acc-1",
    senderId: "user-1",
    contextToken: "ctx-1",
  }, {
    args: "abc 睡觉",
  });
  await CyberbossApp.prototype.handleRemindCommand.call(appLike, {
    accountId: "acc-1",
    senderId: "user-1",
    contextToken: "ctx-1",
  }, {
    args: "5m",
  });
  await CyberbossApp.prototype.handleRemindCommand.call(appLike, {
    accountId: "acc-1",
    senderId: "user-1",
    contextToken: "ctx-1",
  }, {
    args: "maxtimes 0",
  });

  assert.deepEqual(sent.map((item) => item.text), [
    "💡 Usage: /remind <time> <task>",
    "💡 Usage: /remind <time> <task>",
    "💡 Usage: /remind maxtimes <number>",
  ]);
});

test("flushInteractiveReminder sends and requeues until maxTimes", async () => {
  const { queue } = createStores();
  const sent = [];
  const originalNow = Date.now;
  Date.now = () => 1_000_000;
  try {
    const appLike = {
      reminderQueue: queue,
      channelAdapter: {
        getKnownContextTokens() {
          return { "user-1": "latest-ctx" };
        },
        async sendText(payload) {
          sent.push(payload);
        },
      },
    };

    await CyberbossApp.prototype.flushInteractiveReminder.call(appLike, {
      id: "reminder-1",
      kind: "interactive",
      accountId: "acc-1",
      senderId: "user-1",
      contextToken: "old-ctx",
      text: "睡觉",
      dueAtMs: 900_000,
      createdAt: new Date(0).toISOString(),
      promptCount: 0,
      intervalMs: 3 * 60_000,
      maxTimes: 2,
    });

    assert.deepEqual(sent, [{
      userId: "user-1",
      text: "⏰ 提醒：睡觉",
      contextToken: "latest-ctx",
    }]);
    const next = queue.listDue(1_179_999);
    assert.equal(next.length, 0);
    const due = queue.listDue(1_180_000);
    assert.equal(due.length, 1);
    assert.equal(due[0].promptCount, 1);
  } finally {
    Date.now = originalNow;
  }
});

test("acknowledgeInteractiveRemindersForSender removes same-user interactive reminders only", () => {
  const { queue } = createStores();
  queue.enqueue({
    id: "interactive-1",
    kind: "interactive",
    accountId: "acc-1",
    senderId: "user-1",
    contextToken: "ctx-1",
    text: "睡觉",
    dueAtMs: 1_000_000,
    createdAt: new Date(0).toISOString(),
    promptCount: 1,
    intervalMs: 3 * 60_000,
    maxTimes: 6,
  });
  queue.enqueue({
    id: "system-1",
    accountId: "acc-1",
    senderId: "user-1",
    contextToken: "ctx-1",
    text: "legacy",
    dueAtMs: 1_000_000,
    createdAt: new Date(0).toISOString(),
  });

  const appLike = { reminderQueue: queue };
  const acknowledged = CyberbossApp.prototype.acknowledgeInteractiveRemindersForSender.call(appLike, {
    accountId: "acc-1",
    senderId: "user-1",
    receivedAt: "2026-05-17T00:00:00.000Z",
  });

  assert.equal(acknowledged.length, 1);
  assert.equal(acknowledged[0].id, "interactive-1");
  const remaining = queue.listDue(2_000_000);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, "system-1");
  assert.equal(remaining[0].kind, "system");
});

test("legacy reminder queue records normalize as system reminders", () => {
  const { queue } = createStores();
  const reminder = queue.enqueue({
    id: "legacy-1",
    accountId: "acc-1",
    senderId: "user-1",
    contextToken: "ctx-1",
    text: "legacy",
    dueAtMs: 1_000_000,
    createdAt: new Date(0).toISOString(),
  });

  assert.equal(reminder.kind, "system");
});
