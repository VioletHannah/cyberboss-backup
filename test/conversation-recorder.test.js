const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { ConversationRecorder } = require("../src/services/conversation-recorder");

test("conversation recorder writes dashboard-compatible jsonl", () => {
  const dirPath = fs.mkdtempSync(path.join(os.tmpdir(), "cyberboss-conversations-"));
  const recorder = new ConversationRecorder({ dirPath });

  const record = recorder.recordInboundMessage({
    threadId: "thread-1",
    turnId: "turn-1",
    workspaceRoot: "/repo",
    text: "hello",
    timestamp: "2026-05-18T01:02:03.000Z",
    meta: {
      senderId: "user-1",
      attachments: [{
        kind: "image",
        sourceFileName: "cat.png",
        absolutePath: "/tmp/cat.png",
      }],
    },
  });

  const filePath = path.join(dirPath, "2026-05-18.jsonl");
  const lines = fs.readFileSync(filePath, "utf8").trim().split("\n");
  assert.equal(lines.length, 1);

  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.id, record.id);
  assert.equal(parsed.type, "user");
  assert.equal(parsed.threadId, "thread-1");
  assert.equal(parsed.turnId, "turn-1");
  assert.equal(parsed.workspaceRoot, "/repo");
  assert.equal(parsed.text, "hello");
  assert.equal(parsed.meta.senderId, "user-1");
  assert.deepEqual(parsed.meta.attachments, [{
    kind: "image",
    label: "cat.png",
    fileName: "cat.png",
    filePath: "/tmp/cat.png",
  }]);
});

test("conversation recorder maps runtime replies and approvals", () => {
  const dirPath = fs.mkdtempSync(path.join(os.tmpdir(), "cyberboss-conversations-"));
  const recorder = new ConversationRecorder({ dirPath });

  recorder.recordRuntimeEvent({
    type: "runtime.reply.completed",
    payload: {
      threadId: "thread-1",
      turnId: "turn-1",
      text: "done",
    },
  }, {
    workspaceRoot: "/repo",
  });
  recorder.recordRuntimeEvent({
    type: "runtime.approval.requested",
    payload: {
      threadId: "thread-1",
      requestId: "approval-1",
      command: "npm run check",
    },
  }, {
    workspaceRoot: "/repo",
  });

  const files = fs.readdirSync(dirPath);
  assert.equal(files.length, 1);
  const records = fs.readFileSync(path.join(dirPath, files[0]), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

  assert.equal(records[0].type, "assistant");
  assert.equal(records[0].text, "done");
  assert.equal(records[1].type, "approval");
  assert.equal(records[1].text, "npm run check");
  assert.equal(records[1].meta.requestId, "approval-1");
});
