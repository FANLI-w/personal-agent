import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import { Id } from "@research-agent-platform/contracts";

const source = await fs.readFile(
  new URL("../src/research/native-workbench-handoff.ts", import.meta.url),
  "utf8",
);
const module = { exports: {} };
let now = Date.now();
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  {
    module,
    exports: module.exports,
    crypto: { randomUUID },
    Date: { now: () => now },
    Number,
    Error,
    JSON,
    require: (name) =>
      name === "./workbench-links"
        ? { nativeWorkbenchTaskPath: (id, kind) => `/dsh?task=${id}&taskKind=${kind}` }
        : name === "./contact-card"
        ? {
            contactServiceOrigin: (value) => new URL(value).origin,
            readContactServiceOrigin: async () => "https://service.example",
          }
        : { Id },
  },
);
const {
  storeNativeWorkbenchHandoff: write,
  readNativeWorkbenchHandoff: read,
  clearNativeWorkbenchHandoff: clear,
  loadWorkbenchChatContext: load,
} = module.exports;
const actor = {
  memberId: "member_1",
  labId: "lab_1",
  generation: 5,
  serviceOrigin: "https://service.example",
};
const target = { taskId: "task_1", kind: "personal" };
const storage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    values,
  };
};
const context = {
  messages: [
    { conversationId: "chat_1", messageId: "msg_1", text: "Synthetic task source" },
  ],
};
const signal = () => new AbortController().signal;
const plain = (value) => JSON.parse(JSON.stringify(value));
const message = (id = "msg_1", fields = {}) => ({
  id,
  conversationId: "chat_1",
  text: "Synthetic source",
  resources: [],
  turnId: null,
  ...fields,
});
const task = (fields) => ({
  id: "task_1",
  summaryOnly: false,
  conversationId: null,
  turnId: null,
  sourceConversationId: null,
  sourceMessageId: null,
  ...fields,
});

test("handoffs retain the exact actor, task kind, and source without placing chat text in URLs", () => {
  const store = storage(),
    saved = write(actor, target, context, store);
  assert.match(saved.path, /^\/dsh\?task=task_1&taskKind=personal&handoff=/);
  assert.doesNotMatch(saved.path, /Synthetic|chat_1|msg_1/);
  assert.deepEqual(plain(read(saved.nonce, actor, target, store).chat), context);
  assert.equal(store.values.size, 1, "reading does not consume pending attachment");
  clear(saved.nonce, actor, target, store);
  assert.equal(read(saved.nonce, actor, target, store), undefined);
});

test("account, lab, actor generation, task and task-kind changes cannot read or clear another handoff", () => {
  const store = storage(),
    saved = write(actor, target, context, store);
  for (const changed of [
    { ...actor, memberId: "member_2" },
    { ...actor, labId: "lab_2" },
    { ...actor, generation: 6 },
    { ...actor, serviceOrigin: "https://other.example" },
  ]) {
    assert.equal(read(saved.nonce, changed, target, store), undefined);
    clear(saved.nonce, changed, target, store);
  }
  assert.equal(
    read(saved.nonce, actor, { ...target, taskId: "task_2" }, store),
    undefined,
  );
  assert.equal(
    read(saved.nonce, actor, { ...target, kind: "research" }, store),
    undefined,
  );
  assert.ok(read(saved.nonce, actor, target, store));
});

test("expired, malformed, future and oversized handoffs are not attached", () => {
  const store = storage(),
    saved = write(actor, target, context, store);
  now += 15 * 60 * 1000 + 1;
  assert.equal(read(saved.nonce, actor, target, store), undefined);
  now -= 15 * 60 * 1000 + 1;
  const key = [...store.values.keys()][0],
    payload = JSON.parse(store.getItem(key));
  store.setItem(key, JSON.stringify({ ...payload, createdAt: now + 1 }));
  assert.equal(read(saved.nonce, actor, target, store), undefined);
  store.setItem(key, "invalid JSON");
  assert.equal(read(saved.nonce, actor, target, store), undefined);
  assert.throws(() =>
    write(
      actor,
      target,
      { messages: [{ ...context.messages[0], text: "x".repeat(32001) }] },
      store,
    ),
  );
  assert.throws(() => write(actor, target, null, store));
  assert.throws(() => write(actor, { ...target, taskId: "../task" }, context, store));
});

test("a task source pointer reads its precise message and never recent same-Agent history", async () => {
  const calls = [];
  const result = await load(
    target,
    undefined,
    async (name, options) => {
      calls.push([name, options.params]);
      if (name === "personalWorkTask")
        return {
          data: task({
            sourceConversationId: "chat_1",
            sourceMessageId: "old_source",
            conversationId: "chat_1",
            turnId: "turn_1",
          }),
        };
      if (name === "chatMessageDetails")
        return { data: { message: message("old_source"), withdrawn: false } };
      throw Error("Must not read unrelated turn or conversation history");
    },
    signal(),
  );
  assert.equal(result.messages[0].messageId, "old_source");
  assert.deepEqual(
    calls.map(([name]) => name),
    ["personalWorkTask", "chatMessageDetails"],
  );
});

test("delegated tasks carry only the exact turn input and output", async () => {
  const ids = [];
  const result = await load(
    target,
    undefined,
    async (name, options) => {
      if (name === "personalWorkTask")
        return { data: task({ conversationId: "chat_1", turnId: "turn_1" }) };
      if (name === "chatTurn")
        return {
          data: {
            id: "turn_1",
            conversationId: "chat_1",
            inputMessageId: "input_1",
            outputMessageId: "output_1",
          },
        };
      ids.push(options.params.messageId);
      return {
        data: {
          message: message(options.params.messageId, { turnId: "turn_1" }),
          withdrawn: false,
        },
      };
    },
    signal(),
  );
  assert.deepEqual(ids, ["input_1", "output_1"]);
  assert.deepEqual(plain(result.messages.map((item) => item.messageId)), ids);
});

test("another message in the same Agent chat cannot become a task source", async () => {
  await assert.rejects(load(target, { conversationId: "chat_1", messageId: "unrelated_message" }, async (name, options) => {
    if (name === "personalWorkTask") return { data: task({ conversationId: "chat_1", turnId: "turn_1" }) };
    if (name === "chatTurn") return { data: { id: "turn_1", conversationId: "chat_1", inputMessageId: "exact_input", outputMessageId: "exact_output" } };
    return { data: { message: message(options.params.messageId), withdrawn: false } };
  }, signal()), /没有明确关联/);
  await assert.rejects(load(target, undefined, async name => name === "personalWorkTask" ? { data: task({ conversationId: "chat_1", turnId: "turn_1" }) } : { data: { id: "wrong_turn", conversationId: "chat_1" } }, signal()), /轮次不一致/);
});

test("research chat launch requires an explicit task reference and preserves clicked message provenance", async () => {
  const research = { ...target, kind: "research" };
  const source = { conversationId: "chat_1", messageId: "msg_1" };
  const result = await load(
    research,
    source,
    async (name) =>
      name === "task"
        ? { data: { task: { id: "task_1" } } }
        : {
            data: {
              message: message("msg_1", {
                resources: [{ kind: "task", ref: { id: "task_1", version: 2 } }],
              }),
              withdrawn: false,
            },
          },
    signal(),
  );
  assert.equal(result.messages[0].text, "Synthetic source");
  await assert.rejects(
    load(
      research,
      source,
      async (name) =>
        name === "task"
          ? { data: { task: { id: "task_1" } } }
          : { data: { message: message(), withdrawn: false } },
      signal(),
    ),
    /没有明确关联/,
  );
});

test("withdrawn, swapped and unauthorized message/task facts cannot enter context", async () => {
  const source = { conversationId: "chat_1", messageId: "msg_1" };
  for (const details of [
    { message: message(), withdrawn: true },
    { message: message("other_message"), withdrawn: false },
    { message: message("msg_1", { conversationId: "other_chat" }), withdrawn: false },
  ]) {
    await assert.rejects(
      load(
        target,
        source,
        async (name) =>
          name === "personalWorkTask"
            ? {
                data: task({
                  sourceConversationId: "chat_1",
                  sourceMessageId: "msg_1",
                }),
              }
            : { data: details },
        signal(),
      ),
      /聊天记录已不可用/,
    );
  }
  await assert.rejects(
    load(
      target,
      undefined,
      async () => ({ data: task({ summaryOnly: true }) }),
      signal(),
    ),
    /不能读取/,
  );
  await assert.rejects(
    load(
      target,
      undefined,
      async () => ({ data: task({ id: "another_task" }) }),
      signal(),
    ),
    /不能读取/,
  );
});

test("no associated source carries task facts alone; revoked access and cancellation remain visible failures", async () => {
  assert.equal(
    await load(target, undefined, async () => ({ data: task({}) }), signal()),
    undefined,
  );
  await assert.rejects(
    load(
      target,
      undefined,
      async () => {
        throw Error("403 revoked");
      },
      signal(),
    ),
    /403 revoked/,
  );
  const controller = new AbortController();
  await assert.rejects(
    load(
      target,
      undefined,
      async () => {
        controller.abort();
        return { data: task({}) };
      },
      controller.signal,
    ),
    (error) => error.name === "AbortError",
  );
});

async function launchFixture({ reader, serviceReader } = {}) {
  const source = await fs.readFile(new URL("../src/research/NativeWorkbenchTaskButton.tsx", import.meta.url), "utf8");
  const module = { exports: {} }, navigations = [], states = [], store = storage();
  let current = { actor: { member: { id: "member_1", labId: "lab_1" } }, generation: 5 };
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useState: initial => [initial, value => states.push(value)], useRef: initial => ({ current: initial }), useEffect() {} },
    antd: { Button: "Button" },
    "react-router-dom": { useNavigate: () => path => navigations.push(path) },
    "./api": { researchApi: reader || (async () => ({ data: task({}) })) },
    "./store": { useResearchStore: { getState: () => current } },
    "./native-workbench-handoff": { loadWorkbenchChatContext: load, storeNativeWorkbenchHandoff: (actor, target, chat) => write(actor, target, chat, store), readWorkbenchServiceOrigin: serviceReader || (async () => actor.serviceOrigin) },
    "./usePersonalOperation": { usePersonalOperation: () => ({ scope: "synthetic", capture: () => { const saved = current; return { isCurrent: () => saved === current }; } }) },
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { module, exports: module.exports, AbortController, Error, require: name => dependencies[name] });
  const tree = module.exports.NativeWorkbenchTaskButton({ target });
  return { click: () => tree.props.children[0].props.onClick(), navigations, states, store, changeActor: () => { current = { ...current, generation: current.generation + 1 }; } };
}

test("rendered continue action navigates with a scoped handoff and never submits a model/task command", async () => {
  const calls = [];
  const fixture = await launchFixture({ reader: async name => { calls.push(name); return { data: task({}) }; } });
  await fixture.click();
  assert.equal(fixture.navigations.length, 1);
  assert.match(fixture.navigations[0], /task=task_1&taskKind=personal&handoff=/);
  assert.deepEqual(calls, ["personalWorkTask"]);
  const saved = JSON.parse([...fixture.store.values.values()][0]);
  assert.equal(saved.actor.serviceOrigin, actor.serviceOrigin);
});

test("rendered continue action fences account and business-service changes during a read", async () => {
  let finish;
  const fixture = await launchFixture({ reader: () => new Promise(resolve => { finish = resolve; }) });
  const pending = fixture.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  fixture.changeActor();
  finish({ data: task({}) });
  await pending;
  assert.equal(fixture.navigations.length, 0);
  assert.equal(fixture.store.values.size, 0);
  let serviceReads = 0;
  const switched = await launchFixture({ serviceReader: async () => ++serviceReads === 1 ? actor.serviceOrigin : "https://other.example" });
  await switched.click();
  assert.equal(switched.navigations.length, 0);
  assert.ok(switched.states.some(value => typeof value === "string" && value.includes("科研服务已切换")));
});
