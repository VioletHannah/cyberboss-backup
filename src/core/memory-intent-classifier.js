const SLOT_CATEGORIES = {
  identity: ["profile", "facts"],
  relationship: ["relationships"],
  preference: ["preferences"],
  project: ["projects"],
  pattern: ["patterns"],
  open_loop: ["open_loops"],
};

function classifyMemoryIntent(text) {
  const normalized = String(text || "").toLowerCase();
  const slots = new Set();

  if (/(?:\u6211\u662f\u8c01|\u6211\u7684\u540d\u5b57|\u6211\u662f|\u8eab\u4efd|\u751f\u65e5|\u4f4f\u5728|\u6765\u81ea|\u804c\u4e1a|\u5b66\u6821|\u516c\u53f8|profile|identity)/i.test(normalized)) {
    slots.add("identity");
  }
  if (/(?:\u5173\u7cfb|\u670b\u53cb|\u5bb6\u4eba|\u540c\u4e8b|\u4f34\u4fa3|\u559c\u6b22\u7684\u4eba|\u5988\u5988|\u7238\u7238|\u59d0\u59d0|\u54e5\u54e5|\u59b9\u59b9|\u5f1f\u5f1f|relationship)/i.test(normalized)) {
    slots.add("relationship");
  }
  if (/(?:\u559c\u6b22|\u4e0d\u559c\u6b22|\u504f\u597d|\u66f4\u60f3|\u4e0d\u8981|\u522b|\u5fc5\u987b|\u8fb9\u754c|\u7981\u7528|\u4e60\u60ef|\u53e3\u5473|preference|prefer)/i.test(normalized)) {
    slots.add("preference");
  }
  if (/(?:\u9879\u76ee|\u8ba1\u5212|\u4efb\u52a1|\u4ee3\u7801\u5e93|\u4ed3\u5e93|cyberboss|clawbot|project|todo|\u6b63\u5728\u505a)/i.test(normalized)) {
    slots.add("project");
  }
  if (/(?:\u603b\u662f|\u7ecf\u5e38|\u901a\u5e38|\u4e60\u60ef|\u6a21\u5f0f|pattern|\u6bcf\u6b21|\u5bb9\u6613)/i.test(normalized)) {
    slots.add("pattern");
  }
  if (/(?:\u63d0\u9192|\u5f85\u529e|\u4ee5\u540e|\u4e0b\u6b21|\u8bb0\u5f97\u95ee|\u8fd8\u6ca1|open loop|open_loop|\u8ddf\u8fdb)/i.test(normalized)) {
    slots.add("open_loop");
  }
  if (hasExplicitMemorySignal(normalized)) {
    slots.add("preference");
    slots.add("identity");
  }

  return {
    slots: [...slots],
    categories: [...new Set([...slots].flatMap((slot) => SLOT_CATEGORIES[slot] || []))],
  };
}

function hasExplicitMemorySignal(text) {
  return /(?:\u8bf7\u8bb0\u4f4f|\u5e2e\u6211\u8bb0\u4f4f|\u8bb0\u4f4f|\u8fd9\u662f\u4e8b\u5b9e|\u8fd9\u662f\u6211\u7684\u504f\u597d|\u6211\u7684\u504f\u597d\u662f|\u4ee5\u540e\u90fd|\u4e0d\u8981\u5fd8|\u8bb0\u5230\u957f\u671f\u8bb0\u5fc6)/i.test(String(text || ""));
}

module.exports = {
  classifyMemoryIntent,
  hasExplicitMemorySignal,
  SLOT_CATEGORIES,
};
