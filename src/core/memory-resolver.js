const { classifyMemoryIntent } = require("./memory-intent-classifier");

class MemoryResolver {
  constructor({ memoryService }) {
    this.memoryService = memoryService;
  }

  resolveForMessage(text) {
    const intent = classifyMemoryIntent(text);
    if (!intent.categories.length) {
      return { intent, entries: [], markdownByCategory: {}, prompt: "" };
    }
    const entries = this.memoryService.readIndex({ status: "active" })
      .filter((entry) => intent.categories.includes(entry.category));
    const hardEntries = entries.filter((entry) =>
      entry.priority === "hard_fact" || entry.priority === "hard_preference"
    );
    const markdownByCategory = {};
    for (const category of new Set(hardEntries.map((entry) => entry.category))) {
      markdownByCategory[category] = this.memoryService.readMarkdown(category);
    }
    return {
      intent,
      entries,
      markdownByCategory,
      prompt: buildMemoryPrompt(hardEntries.length ? hardEntries : entries),
    };
  }
}

function buildMemoryPrompt(entries) {
  const active = Array.isArray(entries) ? entries.filter((entry) => entry.status === "active") : [];
  if (!active.length) {
    return "";
  }
  const lines = [
    "LOCAL LONG-TERM MEMORY CONSTRAINTS",
    "Use these facts and preferences silently. Do not mention memory files, retrieval, validation, or background storage unless the user explicitly asks about /memory.",
  ];
  for (const entry of active.slice(0, 24)) {
    const value = typeof entry.value === "string" ? entry.value : JSON.stringify(entry.value);
    lines.push(`- [${entry.priority}] ${entry.key}: ${value}. ${entry.text || ""}`.trim());
  }
  lines.push("Current user message follows after this internal block.");
  return lines.join("\n");
}

function injectMemoryPrompt(prepared, resolved) {
  if (!resolved?.prompt || !prepared?.text) {
    return prepared;
  }
  return {
    ...prepared,
    memoryContext: resolved,
    text: `${resolved.prompt}\n\n${prepared.text}`,
  };
}

module.exports = {
  MemoryResolver,
  buildMemoryPrompt,
  injectMemoryPrompt,
};
