import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildLocalDshRuntime } from "../../../integrations/deepseek-harness/desktop/build.mjs";
const require = createRequire(import.meta.url),
  module = { exports: {} };
vm.runInNewContext(
  buildLocalDshRuntime(fileURLToPath(new URL("../", import.meta.url)))
    .outputFiles[0].text,
  {
    module,
    exports: module.exports,
    require,
    process,
    Buffer,
    TextEncoder,
    URL,
    setTimeout,
    clearTimeout,
  }
);
const {
  DshTaskWorkspace,
  verifiedTaskDiscussion,
  nativePreferenceInput,
  effectivePersonalPreferences,
  nativeTaskContextPlugin,
} = module.exports;
const task = {
  kind: "personal",
  taskId: "task_fixture",
  title: "Synthetic task",
  goal: "Fixture goal",
  version: 2,
};

test("discussion follows exact authorized task references and ignores renderer-provided text", async () => {
  const detail = {
    version: 2,
    withdrawn: false,
    message: {
      id: "message_fixture",
      conversationId: "conversation_fixture",
      origin: "human",
      text: "SERVER VERIFIED FIXTURE",
      resources: [{ kind: "task", ref: { id: task.taskId, version: 2 } }],
    },
  };
  const request = {
    messages: [
      {
        conversationId: "conversation_fixture",
        messageId: "message_fixture",
        text: "SPOOFED",
      },
    ],
  };
  const value = await verifiedTaskDiscussion(
    task,
    {},
    null,
    async () => detail,
    request
  );
  assert(value.entries[0].content.includes("SERVER VERIFIED FIXTURE"));
  assert(!value.entries[0].content.includes("SPOOFED"));
  await assert.rejects(
    verifiedTaskDiscussion(
      task,
      {},
      null,
      async () => ({ ...detail, withdrawn: true }),
      request
    ),
    /不可用/
  );
  await assert.rejects(
    verifiedTaskDiscussion(
      task,
      {},
      null,
      async () => ({
        ...detail,
        message: { ...detail.message, resources: [] },
      }),
      request
    ),
    /关联/
  );
  const restored = await verifiedTaskDiscussion(
    task,
    {},
    null,
    async () => detail,
    undefined,
    value.refs
  );
  assert.equal(restored.entries[0].content, value.entries[0].content);
});

test("arbitrary explicit future methods retain separate topics; one-off and quoted instructions do not save", () => {
  const first = nativePreferenceInput("以后汇报先给结论");
  const correction = nativePreferenceInput("以后汇报先列证据");
  const other = nativePreferenceInput("以后比较论文时按实验设置逐项对照");
  assert.equal(first.topic, correction.topic);
  assert.notEqual(first.topic, other.topic);
  assert.equal(
    nativePreferenceInput("请记住，以后汇报先说结论").topic,
    first.topic
  );
  assert.equal(other.content, "以后比较论文时按实验设置逐项对照");
  for (const text of [
    "这次先给结论",
    "以后汇报先给结论，但这次不要保存",
    "例如“以后按方法分类”",
    "以后汇报先给结论？",
  ])
    assert.equal(nativePreferenceInput(text), undefined);
});

test("new-domain corrections and revocations override legacy habits without applying candidates", () => {
  const old = {
    topic: "回答风格",
    status: "confirmed",
    updatedAt: "2026-11-01",
    content: "old",
  };
  const newer = {
    topic: "回复方式",
    status: "revoked",
    updatedAt: "2026-11-02",
    content: "revoked",
  };
  const candidate = { ...newer, status: "candidate", updatedAt: "2026-11-03" };
  const effective = effectivePersonalPreferences([old], [newer, candidate]);
  assert.equal(effective.length, 1);
  assert.equal(effective[0].status, "revoked");
});

test("native attachment preserves custom folder and exact session; only metadata persists and no prompt runs", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "native-task-context-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const folder = path.join(root, "user-chosen");
  await fs.mkdir(folder);
  const sessions = new Set(),
    calls = [];
  const rpc = async (method, args) => {
    calls.push(method);
    if (method === "session/projections")
      return sessions.has(args.sessionId)
        ? { kind: "sequenced", asOfSeq: 0 }
        : null;
    if (method === "workspace/create")
      return { workspace: { workspaceId: args.path } };
    if (method === "session/create") {
      sessions.add(args.sessionId);
      return { sessionId: args.sessionId };
    }
    if (method === "session/page") return { records: [], hasMore: false };
    if (method === "session/list")
      return {
        items: [...sessions].map((sessionId) => ({
          sessionId,
          running: false,
        })),
      };
    return {};
  };
  const store = new DshTaskWorkspace(
      path.join(root, "account-private"),
      rpc,
      async () => {}
    ),
    original = await store.open(task, folder);
  const inputs = {
    fingerprint: "fixture-current",
    entries: [
      {
        id: "preference",
        version: 1,
        kind: "memory",
        title: "Preference",
        content: "PRIVATE HABIT FIXTURE",
      },
    ],
    omitted: [],
  };
  await store.attachContext(task, inputs, [
    { conversationId: "conversation_fixture", messageId: "message_fixture" },
  ]);
  const resumed = await new DshTaskWorkspace(
    store.root,
    rpc,
    async () => {}
  ).open(task);
  assert.equal(resumed.sessionId, original.sessionId);
  assert.equal(resumed.directory, folder);
  assert.equal((await fs.readdir(folder)).length, 0);
  assert(!calls.includes("session/prompt"));
  assert(
    !(
      await fs.readFile(
        path.join(store.root, "personal-task_fixture.json"),
        "utf8"
      )
    ).includes("PRIVATE HABIT FIXTURE")
  );
  assert(
    (await store.nativeContext(task, inputs)).content.includes(
      "PRIVATE HABIT FIXTURE"
    )
  );
  await store.invalidateContext(task);
  assert.equal((await store.load(task)).contextAttachment, undefined);
});

test("official hook only supplies the exact session and refreshes after native user correction", async () => {
  const listeners = {},
    registrations = [],
    requests = [];
  let saved = false;
  const plugin = {};
  const source =
    nativeTaskContextPlugin
      .replace(/export const name/, "const name")
      .replace(/export function apply/, "function apply") +
    "\nplugin.apply=apply;";
  vm.runInNewContext(source, {
    plugin,
    Map,
    Promise,
    AbortSignal,
    process: { env: { ACCEPTCAT_DSH_TOKEN: "synthetic" } },
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url, body });
      if (url.endsWith("task-feedback")) saved = true;
      return {
        ok: true,
        json: async () => ({
          content:
            body.sessionId === "acceptcat-exact"
              ? saved
                ? "CORRECTED FIXTURE"
                : "CURRENT FIXTURE"
              : "",
        }),
      };
    },
  });
  const ctx = {
    inject: (_services, callback) =>
      callback({
        effect: (callback) => callback(),
        systemPrompt: { context: (value) => registrations.push(value) },
      }),
    on: (name, callback) => {
      listeners[name] = callback;
    },
    effect: () => {},
    logger: { warn: () => {} },
  };
  plugin.apply(ctx, { baseURL: "http://127.0.0.1:1" });
  await listeners["agent/pre-step"](
    { agent: { session: { id: "acceptcat-exact" } } },
    async () => ({ kind: "continue" })
  );
  assert.equal(
    registrations[0].text({ scope: { session: { id: "acceptcat-exact" } } }),
    "CURRENT FIXTURE"
  );
  assert.equal(
    registrations[0].text({
      scope: { session: { id: "unrelated-same-folder" } },
    }),
    ""
  );
  listeners["session/event"](
    { id: "acceptcat-exact" },
    {
      type: "user/message",
      seq: 7,
      data: {
        id: "message_native",
        source: { kind: "user" },
        content: [{ type: "text", text: "以后按数据集逐项比较" }],
      },
    }
  );
  await listeners["agent/pre-step"](
    { agent: { session: { id: "acceptcat-exact" } } },
    async () => ({ kind: "continue" })
  );
  assert.equal(
    registrations[0].text({ scope: { session: { id: "acceptcat-exact" } } }),
    "CORRECTED FIXTURE"
  );
  assert(
    requests.some((r) => r.url.endsWith("task-feedback") && r.body.seq === 7)
  );
});
