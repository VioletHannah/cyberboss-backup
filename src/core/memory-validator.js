class MemoryValidator {
  constructor({ memoryService } = {}) {
    this.memoryService = memoryService || null;
  }

  validateDraft(draft, memoryContext = null) {
    const text = String(draft || "");
    const entries = resolveEntries(this.memoryService, memoryContext);
    const hard = entries.filter((entry) =>
      entry.status === "active"
      && (entry.priority === "hard_fact" || entry.priority === "hard_preference")
    );
    const conflicts = [];
    let rewritten = text;

    for (const entry of hard) {
      const value = serializeValue(entry.value);
      if (!value) continue;
      if (mentionsKey(text, entry.key) && contradictsValue(text, value)) {
        conflicts.push(entry);
        rewritten = `我按你已经明确过的来：${entry.text || `${entry.key} 是 ${value}`}。`;
        break;
      }
    }
    return { ok: conflicts.length === 0, text: rewritten, conflicts };
  }
}

function resolveEntries(memoryService, memoryContext) {
  if (Array.isArray(memoryContext?.entries)) {
    return memoryContext.entries;
  }
  if (memoryService) {
    return memoryService.readIndex({ status: "active" });
  }
  return [];
}

function mentionsKey(text, key) {
  const normalizedText = String(text || "").toLowerCase();
  const normalizedKey = String(key || "").toLowerCase().replace(/_/g, " ");
  if (!normalizedKey) return false;
  return normalizedText.includes(normalizedKey) || normalizedKey.split(/\s+/).some((part) => part.length > 1 && normalizedText.includes(part));
}

function contradictsValue(text, value) {
  const normalizedText = String(text || "").toLowerCase();
  const normalizedValue = String(value || "").toLowerCase();
  if (!normalizedValue) return false;
  const hasNegation = /(?:\u4e0d\u662f|\u5e76\u4e0d|\u4e0d\u559c\u6b22|\u4e0d\u9700\u8981|\u4e0d\u80fd|\u4e0d\u4f1a|\u6ca1\u6709|\u76f8\u53cd|no\b|not\b|never\b)/i.test(normalizedText);
  if (normalizedText.includes(normalizedValue)) {
    return hasNegation;
  }
  return hasNegation;
}

function serializeValue(value) {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

module.exports = { MemoryValidator };
