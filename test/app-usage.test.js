const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { AppUsageStore } = require("../src/appUsage/store");
const { AppUsageService } = require("../src/appUsage/service");
const { AppUsageHttpServer } = require("../src/appUsage/server");

async function createService() {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "cyberboss-app-usage-"));
  const service = new AppUsageService({
    store: new AppUsageStore({ dir }),
  });
  await service.initialize();
  return { dir, service };
}

function todayAt(hour, minute = 0) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0).toISOString();
}

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

test("app usage service records events and exposes current usage", async () => {
  const { service } = await createService();
  const result = await service.recordAppUsageEvent({
    device_id: "phone_1",
    app_package: "com.tencent.mm",
    app_name: "WeChat",
    event: "app_open",
    timestamp: minutesAgo(10),
  });
  assert.deepEqual(result, { ok: true });

  const current = await service.getCurrentAppUsage({ device_id: "phone_1" });
  assert.equal(current.ok, true);
  assert.equal(current.device_id, "phone_1");
  assert.equal(current.current_app.app_package, "com.tencent.mm");
  assert.equal(current.current_app.status, "probably_closed");
  assert.equal(current.current_app.confidence, "low");

  const recent = await service.getRecentAppUsageEvents({ device_id: "phone_1", limit: 10 });
  assert.equal(recent.events.length, 1);
  assert.equal(recent.events[0].event, "app_open");
});

test("app usage service defaults to the primary phone device", async () => {
  const { service } = await createService();
  await service.recordAppUsageEvent({
    app_package: "com.tencent.mm",
    app_name: "WeChat",
    event: "app_open",
    timestamp: minutesAgo(1),
  });

  const current = await service.getCurrentAppUsage();
  assert.equal(current.ok, true);
  assert.equal(current.device_id, "vivos30promini");
  assert.equal(current.current_app.app_package, "com.tencent.mm");
});

test("app usage service summarizes open close and heartbeat durations", async () => {
  const { service } = await createService();
  await service.recordAppUsageEvent({
    device_id: "phone_1",
    app_package: "com.tencent.mm",
    app_name: "WeChat",
    event: "app_open",
    timestamp: todayAt(10, 0),
  });
  await service.recordAppUsageEvent({
    device_id: "phone_1",
    app_package: "com.tencent.mm",
    app_name: "WeChat",
    event: "app_heartbeat",
    timestamp: todayAt(10, 20),
  });
  await service.recordAppUsageEvent({
    device_id: "phone_1",
    app_package: "com.tencent.mm",
    app_name: "WeChat",
    event: "app_close",
    timestamp: todayAt(10, 30),
  });

  const summary = await service.getAppUsageSummary({
    device_id: "phone_1",
    from: todayAt(0, 0),
    to: todayAt(23, 59),
  });
  assert.equal(summary.ok, true);
  assert.equal(summary.total_usage_minutes, 30);
  assert.equal(summary.apps[0].app_package, "com.tencent.mm");
  assert.equal(summary.apps[0].usage_minutes, 30);
});

test("app usage http server validates token and required package", async () => {
  const { service } = await createService();
  const server = new AppUsageHttpServer({
    service,
    host: "127.0.0.1",
    port: 0,
    token: "secret",
  });
  await server.start();
  const address = server.server.address();
  const url = `http://127.0.0.1:${address.port}/api/app-usage/event`;
  try {
    const unauthorized = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "screen_off" }),
    });
    assert.equal(unauthorized.status, 401);

    const badRequest = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret",
      },
      body: JSON.stringify({ event: "app_open" }),
    });
    assert.equal(badRequest.status, 400);
    assert.match(await badRequest.text(), /app_package is required/);

    const ok = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret",
      },
      body: JSON.stringify({
        device_id: "phone_1",
        event: "screen_off",
      }),
    });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { ok: true });
  } finally {
    await server.close();
  }
});
