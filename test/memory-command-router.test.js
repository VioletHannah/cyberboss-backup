const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { MemoryService } = require("../src/services/memory-service");
const { MemoryMiner } = require("../src/core/memory-miner");
const { MemoryCommandRouter } = require("../src/core/memory-command-router");

function createRouter() {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "cyberboss-memory-router-"));
  const memoryService = new MemoryService({ stateDir });
  memoryService.initialize();
  const memoryMiner = new MemoryMiner({ memoryService });
  return {
    memoryService,
    router: new MemoryCommandRouter({ memoryService, memoryMiner }),
  };
}

test("memory command router supports search, show, forget, update, undo, pending, approve, reject, prune, and mine", async () => {
  const { memoryService, router } = createRouter();
  memoryService.appendMemory({
    category: "preferences",
    key: "tone",
    value: "soft",
    priority: "hard_preference",
    text: "Use a soft tone.",
  });

  assert.match(await router.run("search tone"), /tone/);
  assert.match(await router.run("show preferences"), /soft/);
  assert.match(await router.run("forget tone"), /Reply with/);
  assert.match(await router.run("forget tone confirm"), /Deleted/);

  memoryService.appendMemory({
    category: "facts",
    key: "city",
    value: "Nanjing",
    priority: "hard_fact",
    text: "User lives in Nanjing.",
  });
  assert.match(await router.run("update city Shanghai"), /updated/);
  assert.match(await router.run("undo last"), /undone/);

  const pending = memoryService.appendPending({
    category: "facts",
    key: "pending_food",
    value: "rice",
    priority: "hard_fact",
    text: "User eats rice.",
  });
  assert.match(await router.run("pending"), /pending_food/);
  assert.match(await router.run(`reject ${pending.id}`), /rejected/);
  const pending2 = memoryService.appendPending({
    category: "facts",
    key: "pending_drink",
    value: "tea",
    priority: "hard_fact",
    text: "User drinks tea.",
  });
  assert.match(await router.run(`approve ${pending2.id}`), /approve/);
  assert.match(await router.run("prune facts"), /prune/);
  assert.match(await router.run("mine"), /mine/);
});
