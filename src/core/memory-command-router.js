class MemoryCommandRouter {
  constructor({ memoryService, memoryMiner }) {
    this.memoryService = memoryService;
    this.memoryMiner = memoryMiner;
  }

  async run(args = "", context = {}) {
    const [subcommandRaw, ...rest] = String(args || "").trim().split(/\s+/).filter(Boolean);
    const subcommand = String(subcommandRaw || "help").toLowerCase();
    const tail = rest.join(" ").trim();
    switch (subcommand) {
      case "search":
        return formatEntries(this.memoryService.searchMemory(tail));
      case "show":
        return formatEntries(this.memoryService.readIndex({ category: tail, status: "active" }));
      case "forget":
        return this.forget(tail, context);
      case "update":
        return this.update(tail);
      case "undo":
        return this.undo(tail);
      case "pending":
        return formatEntries(this.memoryService.readPending({ status: "pending" }));
      case "approve":
        return formatResult("approve", this.memoryService.approvePending(tail));
      case "reject":
        return this.memoryService.rejectPending(tail) ? "Memory pending item rejected." : "No matching pending item.";
      case "prune":
        return formatResult("prune", this.memoryService.pruneCategory(tail));
      case "mine":
        return formatResult("mine", this.memoryMiner?.runBatchMining?.({ force: true }) || { status: "unavailable" });
      default:
        return [
          "Memory commands:",
          "/memory search <keyword>",
          "/memory show <category>",
          "/memory forget <keyword-or-key>",
          "/memory update <key> <new_value>",
          "/memory undo last",
          "/memory pending",
          "/memory approve <pending_id>",
          "/memory reject <pending_id>",
          "/memory prune <category>",
          "/memory mine",
        ].join("\n");
    }
  }

  forget(query, context = {}) {
    const immediate = /(立即|不用确认|confirm|confirmed|now|马上)/i.test(`${query} ${context.rawText || ""}`);
    const searchQuery = String(query || "").replace(/\b(confirm|confirmed|now)\b/ig, "").replace(/立即|不用确认|马上/g, "").trim();
    const matches = this.memoryService.searchMemory(searchQuery).filter((entry) => entry.status === "active");
    if (!matches.length) {
      return "No matching memory found.";
    }
    if (!immediate) {
      return `Found ${matches.length} matching memories. Reply with /memory forget ${query} confirm to delete.`;
    }
    for (const entry of matches) {
      this.memoryService.markDeleted(entry.id);
    }
    return `Deleted ${matches.length} memory record(s).`;
  }

  update(tail) {
    const [key, ...valueParts] = String(tail || "").split(/\s+/).filter(Boolean);
    const value = valueParts.join(" ").trim();
    if (!key || !value) {
      return "Usage: /memory update <key> <new_value>";
    }
    return formatResult("update", this.memoryService.updateMemory(key, value));
  }

  undo(tail) {
    if (String(tail || "").trim().toLowerCase() !== "last") {
      return "Usage: /memory undo last";
    }
    return formatResult("undo", this.memoryService.undoLastWrite());
  }
}

function formatEntries(entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) {
    return "No memory records found.";
  }
  return list.slice(0, 30).map((entry) => {
    const value = typeof entry.value === "string" ? entry.value : JSON.stringify(entry.value);
    return `${entry.id} ${entry.category}/${entry.key} [${entry.priority}] ${value}\n${entry.text || ""}`.trim();
  }).join("\n\n");
}

function formatResult(label, result) {
  return `${label}: ${JSON.stringify(result)}`;
}

module.exports = { MemoryCommandRouter };
