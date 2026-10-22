import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function load(file, substitutes = {}) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    code,
    {
      module,
      exports: module.exports,
      DOMException,
      AbortController,
      setTimeout,
      clearTimeout,
      require: (name) => {
        if (!Object.hasOwn(substitutes, name))
          throw Error(`Unexpected import: ${name}`);
        return substitutes[name];
      },
    },
    { filename: file },
  );
  return module.exports;
}
const deadline = await load("../src/research/request-deadline.ts");

async function fixture(overrides = {}) {
  const conversation = {
    conversationID: "chat-a",
    userID: "user-b",
    groupID: "",
    conversationType: 1,
    isPinned: false,
    recvMsgOpt: 0,
  };
  const calls = { read: 0, writes: [], api: [], updates: 0, deletes: [] };
  let state = { conversationList: [conversation, { conversationID: "chat-keep" }] };
  let current = true;
  const controller = new AbortController();
  const sdk = {
    getOneConversation: async () => {
      calls.read++;
      return { data: { ...conversation } };
    },
    setConversation: async (body) => {
      calls.writes.push(body);
      Object.assign(conversation, body);
    },
    deleteConversationAndDeleteAllMsg: async (id) => {
      calls.deletes.push(id);
    },
    ...overrides.sdk,
  };
  const api = async (name, options) => {
    calls.api.push({ name, options });
    if (overrides.api) return overrides.api(name, options);
    return { data: { viewerState: { pinned: false, version: 7 } } };
  };
  const actions = await load("../src/research/conversation-actions.ts", {
    "@openim/wasm-client-sdk": {
      MessageReceiveOption: { Receive: 0, ReceiveWithoutNotification: 2 },
    },
    "@/layout/MainContentWrap": { IMSDK: sdk },
    "@/store": {
      useConversationStore: {
        getState: () => ({
          updateConversationList: () => {
            calls.updates++;
          },
        }),
        setState: (update) => {
          state = { ...state, ...update(state) };
        },
      },
    },
    "./api": { researchApi: api },
    "./request-deadline": deadline,
  });
  return {
    ...actions,
    calls,
    conversation,
    state: () => state,
    controller,
    scope: {
      conversation: { ...conversation },
      isCoordinator: false,
      signal: controller.signal,
      isCurrent: () => current,
    },
    invalidate: () => {
      current = false;
    },
  };
}

test("mute enables and disables, while repeating the explicit intent is idempotent", async () => {
  const f = await fixture();
  await f.changeConversationPreference(f.scope, "mute", true);
  assert.equal(f.calls.writes[0].recvMsgOpt, 2);
  await f.changeConversationPreference(f.scope, "mute", true);
  assert.equal(f.calls.writes[1].recvMsgOpt, 2);
  await f.changeConversationPreference(f.scope, "mute", false);
  assert.equal(f.calls.writes[2].recvMsgOpt, 0);
  assert.equal(f.calls.updates, 3);
  assert.equal(f.calls.api.length, 0);
});

test("pin keeps the explicit intent with canonical version before syncing the SDK", async () => {
  const f = await fixture();
  f.conversation.isPinned = true;
  await f.changeConversationPreference(
    { ...f.scope, researchConversationId: "research-a" },
    "pin",
    true,
  );
  const write = f.calls.api.find((call) => call.name === "updateChatPreferences");
  assert.equal(write.options.body.expectedVersion, 7);
  assert.equal(write.options.body.pinned, true);
  assert.equal(f.calls.writes[0].isPinned, true);
});

test("rejected canonical pin does not mutate SDK state", async () => {
  const f = await fixture({
    api: async (name) => {
      if (name === "updateChatPreferences") throw Error("VERSION_CONFLICT");
      return { data: { viewerState: { pinned: false, version: 7 } } };
    },
  });
  await assert.rejects(
    f.changeConversationPreference(
      { ...f.scope, researchConversationId: "research-a" },
      "pin",
      true,
    ),
    /VERSION_CONFLICT/,
  );
  assert.equal(f.calls.writes.length, 0);
  assert.equal(f.calls.updates, 0);
});

test("switching account during canonical read prevents the later write", async () => {
  let f;
  f = await fixture({
    api: async () => {
      f.invalidate();
      return { data: { viewerState: { pinned: false, version: 7 } } };
    },
  });
  await assert.rejects(
    f.changeConversationPreference(
      { ...f.scope, researchConversationId: "research-a" },
      "pin",
      true,
    ),
    { name: "AbortError" },
  );
  assert.equal(f.calls.api.length, 1);
  assert.equal(f.calls.writes.length, 0);
});

test("a late SDK write cannot refresh another account's conversation list", async () => {
  let f;
  f = await fixture({
    sdk: {
      setConversation: async () => {
        f.invalidate();
      },
    },
  });
  await assert.rejects(f.changeConversationPreference(f.scope, "mute", true), {
    name: "AbortError",
  });
  assert.equal(f.calls.read, 0);
  assert.equal(f.calls.updates, 0);
});

test("stale deletion confirmation and fixed assistant never call destructive SDK methods", async () => {
  const f = await fixture();
  await assert.rejects(
    f.deleteIMConversation({ ...f.scope, isCoordinator: true }),
    /无法删除/,
  );
  await assert.rejects(
    f.changeConversationPreference({ ...f.scope, isCoordinator: true }, "pin", false),
    /固定置顶/,
  );
  f.invalidate();
  await assert.rejects(f.deleteIMConversation(f.scope), { name: "AbortError" });
  assert.equal(f.calls.deletes.length, 0);
  assert.equal(f.calls.read, 0);
});

test("deleting confirmed IM chat removes only its row and leaves research records untouched", async () => {
  const f = await fixture();
  await f.deleteIMConversation(f.scope);
  assert.equal(f.calls.deletes[0], "chat-a");
  assert.equal(f.state().conversationList.length, 1);
  assert.equal(f.state().conversationList[0].conversationID, "chat-keep");
  assert.equal(f.calls.api.length, 0);
});
