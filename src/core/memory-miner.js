const { extractMemoryCandidates } = require("./memory-candidate-extractor");

const DEFAULT_MINING_INTERVAL_MS = 30 * 60 * 1000;

class MemoryMiner {
  constructor({ memoryService, now = () => Date.now() }) {
    this.memoryService = memoryService;
    this.now = now;
    this.buffer = [];
    this.processedTurnIds = new Set();
    this.lastMiningAt = this.now();
  }

  addTurn(turn) {
    const turnId = String(turn?.turnId || turn?.messageId || `${this.now()}-${this.buffer.length}`);
    if (this.processedTurnIds.has(turnId)) {
      return;
    }
    this.buffer.push({
      ...turn,
      turnId,
      text: String(turn?.text || turn?.userText || "").trim(),
      addedAt: this.now(),
    });
    if (this.buffer.length > 100) {
      this.buffer = this.buffer.slice(-100);
    }
  }

  shouldRunBatchMining({ force = false } = {}) {
    if (force) return true;
    const pending = this.buffer.filter((turn) => !this.processedTurnIds.has(turn.turnId));
    if (!pending.length) return false;
    const chars = pending.reduce((sum, turn) => sum + countChineseLikeChars(turn.text), 0);
    const latestText = pending[pending.length - 1]?.text || "";
    return this.now() - this.lastMiningAt >= DEFAULT_MINING_INTERVAL_MS
      || pending.length >= 20
      || chars >= 4000
      || /(先这样|就到这|回头再说|谢谢|晚安|结束)/i.test(latestText);
  }

  runBatchMining({ force = false } = {}) {
    if (!this.shouldRunBatchMining({ force })) {
      return { status: "skipped", candidates: [] };
    }
    const window = this.buffer
      .filter((turn) => !this.processedTurnIds.has(turn.turnId))
      .slice(-30);
    const candidates = mergeCandidates(window.flatMap((turn) => extractMemoryCandidates(turn)));
    const results = [];
    for (const candidate of candidates) {
      const result = candidate.confidence < 0.8
        ? { status: "pending", entry: this.memoryService.appendPending(candidate) }
        : this.memoryService.appendMemory(candidate);
      results.push(result);
    }
    for (const turn of window) {
      this.processedTurnIds.add(turn.turnId);
    }
    this.lastMiningAt = this.now();
    return { status: "mined", candidates, results };
  }
}

function mergeCandidates(candidates) {
  const byKey = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.category}:${candidate.key}`;
    byKey.set(key, { ...(byKey.get(key) || {}), ...candidate });
  }
  return [...byKey.values()];
}

function countChineseLikeChars(text) {
  return Array.from(String(text || "").replace(/\s+/g, "")).length;
}

module.exports = {
  MemoryMiner,
  mergeCandidates,
};
