const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { CyberbossApp } = require("../src/core/app");
const { MemoryService } = require("../src/services/memory-service");
const { MemoryResolver } = require("../src/core/memory-resolver");
const { MemoryMiner } = require("../src/core/memory-miner");

test("pre-response memory read injects active hard memory constraints", () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "cyberboss-memory-flow-"));
  const memoryService = new MemoryService({ stateDir });
  memoryService.initialize();
  memoryService.appendMemory({
    category: "preferences",
    key: "tea",
    value: "green",
    priority: "hard_preference",
    text: "User likes green tea.",
  });

  const prepared = CyberbossApp.prototype.applyPreResponseMemory.call({
    memoryResolver: new MemoryResolver({ memoryService }),
  }, {
    provider: "weixin",
    originalText: "\u6211\u559c\u6b22\u4ec0\u4e48\u8336\uff1f",
    text: "\u6211\u559c\u6b22\u4ec0\u4e48\u8336\uff1f",
  });

  assert.match(prepared.text, /LOCAL LONG-TERM MEMORY CONSTRAINTS/);
  assert.match(prepared.text, /green/);
  assert.equal(prepared.memoryApplied, true);
});

test("post-response strong signal writes immediately and normal text buffers for batch mining", async () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "cyberboss-memory-flow-"));
  const memoryService = new MemoryService({ stateDir });
  memoryService.initialize();
  const memoryMiner = new MemoryMiner({ memoryService, now: () => Date.now() });
  const app = {
    memoryService,
    memoryMiner,
  };

  await CyberbossApp.prototype.handleMemoryTurnFinished.call(app, {
    provider: "weixin",
    text: "\u8bf7\u8bb0\u4f4f\uff1a\u6211\u7684\u504f\u597d\u662f\u5c11\u653e\u7cd6",
    turnId: "turn-1",
  });
  assert.equal(memoryService.readIndex({ status: "active" }).length, 1);

  await CyberbossApp.prototype.handleMemoryTurnFinished.call(app, {
    provider: "weixin",
    text: "\u666e\u901a\u804a\u5929\uff0c\u4e0d\u89e6\u53d1\u5f3a\u4fe1\u53f7",
    turnId: "turn-2",
  });
  assert.equal(memoryMiner.buffer.length, 1);
});
