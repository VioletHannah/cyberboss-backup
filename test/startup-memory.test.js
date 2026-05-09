const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { buildStartupMemoryBlock } = require("../src/adapters/runtime/startup-memory");
const { buildOpeningTurnText } = require("../src/adapters/runtime/shared-instructions");

test("startup memory pack includes recent diary, timeline, and session binding", () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "cyberboss-startup-memory-"));
  const diaryDir = path.join(stateDir, "diary");
  const timelineDir = path.join(stateDir, "timeline");
  fs.mkdirSync(diaryDir, { recursive: true });
  fs.mkdirSync(timelineDir, { recursive: true });
  fs.writeFileSync(path.join(diaryDir, "2026-05-09.md"), "## 09:00\n\nToday note", "utf8");
  fs.writeFileSync(path.join(diaryDir, "2026-05-08.md"), "## 22:00\n\nYesterday note", "utf8");
  fs.writeFileSync(path.join(timelineDir, "timeline-facts.json"), JSON.stringify({
    facts: {
      "2026-05-09": {
        status: "draft",
        events: [{
          startAt: "2026-05-09T01:00:00.000Z",
          endAt: "2026-05-09T02:00:00.000Z",
          title: "Breakfast",
          note: "Ate and reset the morning.",
        }],
      },
    },
  }), "utf8");

  const sessionStore = {
    getBinding() {
      return {
        workspaceId: "default",
        accountId: "account-1",
        senderId: "sender-1",
      };
    },
    listWorkspaceRoots() {
      return ["G:/cyberboss"];
    },
  };

  const block = buildStartupMemoryBlock({
    stateDir,
    diaryDir,
  }, {
    now: new Date("2026-05-09T08:00:00.000+08:00"),
    sessionStore,
    bindingKey: "default:account-1:sender-1",
    workspaceRoot: "G:/cyberboss",
    runtimeId: "codex",
  });

  assert.match(block, /STARTUP MEMORY PACK/);
  assert.match(block, /Today note/);
  assert.match(block, /Yesterday note/);
  assert.match(block, /Breakfast/);
  assert.match(block, /workspaceRoot: G:\/cyberboss/);
  assert.match(block, /senderId: sender-1/);
});

test("opening turn appends startup memory before the current user message", () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "cyberboss-opening-memory-"));
  const diaryDir = path.join(stateDir, "diary");
  fs.mkdirSync(diaryDir, { recursive: true });
  fs.writeFileSync(path.join(diaryDir, "2026-05-09.md"), "Small continuity note", "utf8");

  const text = buildOpeningTurnText({
    stateDir,
    diaryDir,
  }, "hello", {
    now: new Date("2026-05-09T08:00:00.000+08:00"),
  });

  assert.match(text, /STARTUP MEMORY PACK/);
  assert.match(text, /Small continuity note/);
  assert.match(text, /Current user message:\nhello/);
});
