const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { MemoryService } = require("../src/services/memory-service");

function createService() {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "cyberboss-memory-"));
  const service = new MemoryService({ stateDir });
  service.initialize();
  return { stateDir, service };
}

test("memory service initializes markdown and jsonl files", () => {
  const { stateDir, service } = createService();
  const memoryDir = path.join(stateDir, "memory");
  for (const fileName of ["facts.md", "preferences.md", "patterns.md", "projects.md", "open_loops.md", "relationships.md", "profile.md", "index.jsonl", "pending.jsonl", "ops.jsonl"]) {
    assert.equal(fs.existsSync(path.join(memoryDir, fileName)), true);
  }
  assert.deepEqual(service.readIndex(), []);
});

test("appendMemory writes, skips duplicates, and sends conflicts to pending", () => {
  const { service } = createService();
  const first = service.appendMemory({
    category: "preferences",
    key: "tea",
    value: "green",
    priority: "hard_preference",
    text: "User likes green tea.",
  });
  assert.equal(first.status, "written");

  const duplicate = service.appendMemory({
    category: "preferences",
    key: "tea",
    value: "green",
    priority: "hard_preference",
    text: "User likes green tea.",
  });
  assert.equal(duplicate.status, "duplicate");

  const conflict = service.appendMemory({
    category: "preferences",
    key: "tea",
    value: "black",
    priority: "hard_preference",
    text: "User likes black tea.",
  });
  assert.equal(conflict.status, "conflict");
  assert.equal(service.readPending({ status: "pending" }).length, 1);
});

test("update, delete, undo, approve, reject, and prune preserve state trail", () => {
  const { service } = createService();
  service.appendMemory({
    category: "facts",
    key: "city",
    value: "Nanjing",
    priority: "hard_fact",
    text: "User lives in Nanjing.",
  });

  const updated = service.updateMemory("city", "Shanghai");
  assert.equal(updated.status, "updated");
  assert.equal(service.readIndex({ key: "city", status: "active" })[0].value, "Shanghai");
  assert.equal(service.readIndex({ key: "city", status: "superseded" }).length, 1);

  const deleted = service.markDeleted(updated.entry.id);
  assert.equal(deleted.status, "deleted");
  const undone = service.undoLastWrite();
  assert.equal(undone.status, "undone");

  const pending = service.appendPending({
    category: "facts",
    key: "food",
    value: "no onion",
    priority: "hard_fact",
    text: "User cannot eat onion.",
  });
  assert.ok(service.rejectPending(pending.id));
  const pending2 = service.appendPending({
    category: "facts",
    key: "drink",
    value: "water",
    priority: "hard_fact",
    text: "User drinks water.",
  });
  const approved = service.approvePending(pending2.id);
  assert.ok(["written", "duplicate", "conflict"].includes(approved.status));

  const pruned = service.pruneCategory("facts");
  assert.equal(fs.existsSync(pruned.markdownBackup), true);
  assert.equal(fs.existsSync(pruned.indexBackup), true);
  assert.ok(service.readOps().length > 0);
});
