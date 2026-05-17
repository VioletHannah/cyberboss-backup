const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { resolveBodyInput } = require("../src/services/text-input");
const { buildTimelineFailureMessage, prepareTimelineInvocation } = require("../src/integrations/timeline");

function createTempFile(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cyberboss-command-test-"));
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

test("reminder body can be loaded from --text-file", async () => {
  const filePath = createTempFile("reminder.txt", "  remember me  \n");
  const body = await resolveBodyInput({ text: "", textFile: filePath });
  assert.equal(body, "remember me");
});

test("diary body can be loaded from --text-file", async () => {
  const filePath = createTempFile("diary.md", "\nline one\nline two\n");
  const body = await resolveBodyInput({ text: "", textFile: filePath });
  assert.equal(body, "line one\nline two");
});

test("timeline invocation translates --locale and --events-file", () => {
  const filePath = createTempFile("events.json", "[{\"title\":\"ship it\"}]");
  const prepared = prepareTimelineInvocation("write", [
    "--date", "2026-04-11",
    "--locale", "en",
    "--events-file", filePath,
  ]);

  assert.deepEqual(prepared.extraEnv, { TIMELINE_FOR_AGENT_LOCALE: "en" });
  assert.deepEqual(prepared.args, [
    "--date", "2026-04-11",
    "--json", "[{\"title\":\"ship it\"}]",
  ]);
});

test("timeline invocation rejects mixed json sources", () => {
  assert.throws(() => {
    prepareTimelineInvocation("write", ["--json", "[]", "--events-json", "[]"]);
  }, /Use only one of --json, --events-json, or --events-file/);
});

test("timeline failure message explains port conflicts", () => {
  const message = buildTimelineFailureMessage({
    subcommand: "serve",
    code: 1,
    stderr: "Error: listen EADDRINUSE: address already in use 127.0.0.1:4317",
  });
  assert.match(message, /port is already in use/i);
  assert.match(message, /4317/);
});

test("cyberboss timeline CLI forwards to timeline-for-agent", () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "cyberboss-timeline-cli-"));
  const result = spawnSync(process.execPath, [
    path.resolve(__dirname, "../bin/cyberboss.js"),
    "timeline",
    "read",
    "--date",
    "2026-05-17",
  ], {
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...process.env,
      CYBERBOSS_STATE_DIR: stateDir,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.date, "2026-05-17");
  assert.equal(parsed.status, "missing");
});
