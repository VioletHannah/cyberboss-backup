const BLOCK_PATTERNS = [
  /\b(memory|memories)\s+(流程|分类|读取|写入|整理|检索|冲突|校验|pipeline|system|index)\b/i,
  /\b(index|pending|ops|facts|preferences|patterns|projects|open_loops|relationships|profile)\.(jsonl|md)\b/i,
  /\b后台(读取|写入|整理|检索|追加|校验)\b/i,
  /\b(debug|stdout|日志|中间草稿|内部判断|chain of thought|draft conflict|conflict validator)\b/i,
  /LOCAL LONG-TERM MEMORY CONSTRAINTS/i,
];

function filterOutgoingMessage(text, { allowMemoryDetails = false } = {}) {
  const normalized = String(text || "").trim();
  if (!normalized || allowMemoryDetails) {
    return normalized;
  }
  let cleaned = normalized;
  for (const pattern of BLOCK_PATTERNS) {
    if (pattern.test(cleaned)) {
      cleaned = cleaned
        .split(/\r?\n/)
        .filter((line) => !pattern.test(line))
        .join("\n")
        .trim();
    }
  }
  if (!cleaned || BLOCK_PATTERNS.some((pattern) => pattern.test(cleaned))) {
    return "我处理好了。";
  }
  return cleaned;
}

module.exports = {
  filterOutgoingMessage,
  BLOCK_PATTERNS,
};
