const { hasExplicitMemorySignal } = require("./memory-intent-classifier");

function extractMemoryCandidates(input = {}) {
  const text = String(input.text || input.userText || "").trim();
  if (!text || !hasExplicitMemorySignal(text)) {
    return [];
  }
  const cleaned = text
    .replace(/^(?:\u8bf7|\u9ebb\u70e6)?(?:\u5e2e\u6211)?\u8bb0\u4f4f[\uff1a:，,\s]*/i, "")
    .replace(/^\u8fd9\u662f(?:\u4e00\u4e2a)?(?:\u4e8b\u5b9e|\u504f\u597d|\u8fb9\u754c)[\uff1a:，,\s]*/i, "")
    .trim();
  if (!cleaned) {
    return [];
  }
  const category = inferCategory(cleaned);
  const priority = inferPriority(cleaned, category);
  return [{
    category,
    key: inferKey(cleaned, category),
    value: inferValue(cleaned),
    priority,
    scope: "user",
    source: "wechat",
    text: cleaned,
    turnId: input.turnId || "",
    confidence: priority.startsWith("hard") ? 0.95 : 0.9,
  }];
}

function inferCategory(text) {
  if (/(?:\u559c\u6b22|\u4e0d\u559c\u6b22|\u504f\u597d|\u4ee5\u540e|\u4e0d\u8981|\u522b|\u5fc5\u987b|\u8fb9\u754c|\u7981\u7528)/i.test(text)) return "preferences";
  if (/(?:\u9879\u76ee|\u8ba1\u5212|\u6b63\u5728\u505a|\u4ed3\u5e93|\u4ee3\u7801\u5e93|\u4efb\u52a1)/i.test(text)) return "projects";
  if (/(?:\u5173\u7cfb|\u670b\u53cb|\u5bb6\u4eba|\u540c\u4e8b|\u4f34\u4fa3|\u5988\u5988|\u7238\u7238)/i.test(text)) return "relationships";
  if (/(?:\u603b\u662f|\u7ecf\u5e38|\u901a\u5e38|\u4e60\u60ef|\u6bcf\u6b21)/i.test(text)) return "patterns";
  if (/(?:\u63d0\u9192|\u5f85\u529e|\u4ee5\u540e\u95ee|\u8ddf\u8fdb|\u8fd8\u6ca1)/i.test(text)) return "open_loops";
  if (/(?:\u6211\u662f|\u6211\u7684\u540d\u5b57|\u751f\u65e5|\u4f4f\u5728|\u6765\u81ea|\u804c\u4e1a)/i.test(text)) return "profile";
  return "facts";
}

function inferPriority(text, category) {
  if (/(?:\u4e8b\u5b9e|\u5c31\u662f|\u5fc5\u987b|\u6c38\u8fdc|\u4e0d\u8981|\u522b|\u8fb9\u754c|\u7981\u7528|\u4ee5\u540e\u90fd)/i.test(text)) {
    return category === "preferences" ? "hard_preference" : "hard_fact";
  }
  if (category === "preferences") return "soft_preference";
  if (category === "projects") return "project";
  if (category === "open_loops") return "open_loop";
  if (category === "relationships") return "relationship";
  if (category === "patterns") return "pattern";
  return "hard_fact";
}

function inferKey(text, category) {
  const match = text.match(/(?:\u6211\u7684|\u6211)?([\p{L}\p{N}_-]{2,18})(?:\u662f|\u4e3a|\u53eb|=|\uff1a|:)/u);
  if (match) return match[1];
  return `${category}_${text.slice(0, 24)}`;
}

function inferValue(text) {
  const match = text.match(/(?:\u662f|\u4e3a|\u53eb|=|\uff1a|:)\s*(.+)$/u);
  return (match ? match[1] : text).trim();
}

module.exports = {
  extractMemoryCandidates,
};
