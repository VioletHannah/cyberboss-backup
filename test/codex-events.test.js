const test = require("node:test");
const assert = require("node:assert/strict");

const { mapCodexMessageToRuntimeEvent } = require("../src/adapters/runtime/codex/events");

test("codex commentary agent messages are not deliverable replies", () => {
  const event = mapCodexMessageToRuntimeEvent({
    method: "item/completed",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      item: {
        id: "item-1",
        type: "agentMessage",
        channel: "commentary",
        text: "I am checking files.",
      },
    },
  });

  assert.equal(event, null);
});

test("codex final agent messages remain deliverable replies", () => {
  const event = mapCodexMessageToRuntimeEvent({
    method: "item/completed",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      item: {
        id: "item-1",
        type: "agentMessage",
        channel: "final",
        text: "Done.",
      },
    },
  });

  assert.deepEqual(event, {
    type: "runtime.reply.completed",
    payload: {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
      text: "Done.",
    },
  });
});

test("codex legacy agent messages without a channel remain deliverable replies", () => {
  const event = mapCodexMessageToRuntimeEvent({
    method: "item/completed",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      item: {
        id: "item-1",
        type: "agentMessage",
        text: "Legacy reply.",
      },
    },
  });

  assert.equal(event?.type, "runtime.reply.completed");
  assert.equal(event?.payload?.text, "Legacy reply.");
});
