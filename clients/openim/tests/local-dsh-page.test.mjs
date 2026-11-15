import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { randomUUID } from "node:crypto";

const source = (name) =>
  fs.readFileSync(new URL(`../src/research/${name}`, import.meta.url), "utf8");
const compile = (value) =>
  ts.transpileModule(value, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
const id = {
  safeParse: (value) => ({
    success: typeof value === "string" && /^[\w-]{1,128}$/.test(value),
  }),
};
function loadHelper(name, dependencies = {}) {
  const module = { exports: {} };
  vm.runInNewContext(compile(source(name)), {
    module,
    exports: module.exports,
    crypto: { randomUUID },
    URLSearchParams,
    Error,
    require: (name) => dependencies[name] || { Id: id },
  });
  return module.exports;
}
const helper = loadHelper("local-dsh-context.ts");
const selection = loadHelper("team-material-selection.ts");
const binding = {
  kind: "research",
  taskId: "task_1",
  sessionId: "exact_session",
  directory: "C:/synthetic/task",
  sources: [{ localName: "input.pdf" }],
  localMaterials: [
    { localName: "source.json", filename: "source.json", sha256: "abc" },
  ],
  teamMaterialReceipts: [
    {
      repository: "https://synthetic.test/team",
      revision: "selected_git_revision",
      entries: [
        { id: "template_1", name: "Pinned template", sha256: "abc123selectedhash" },
      ],
      createdAt: "2026-11-15T00:00:00Z",
    },
  ],
};
const receipt = {
  path: "C:/synthetic/task/.acceptcat-context.md",
  fingerprint: "verified",
  createdAt: "2026-11-15T00:00:00Z",
  entries: [
    { kind: "task", id: "task_1", title: "Synthetic task", version: 2 },
    { kind: "rule", id: "rule_1", title: "Synthetic rules", version: 3 },
  ],
  omitted: [],
};
const snapshot = () => ({
  binding: { ...binding, contextAttachment: receipt },
  phase: "ready",
  files: [
    { name: "input.pdf", size: 3 },
    { name: "report.md", size: 9 },
    { name: ".acceptcat-context.md", size: 20 },
  ],
});
function text(node) {
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (node && typeof node === "object") return text(node.props?.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function find(node, predicate) {
  if (Array.isArray(node)) return node.flatMap((item) => find(item, predicate));
  if (!node || typeof node !== "object") return [];
  return [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate)];
}

function host({
  params = "task=task_1&taskKind=research",
  attachFails = false,
  openWait,
  initialPhase = "ready",
  promptFailOnce = false,
} = {}) {
  let index = 0,
    tree;
  const hooks = [],
    pendingEffects = [],
    calls = [],
    storage = new Map();
  const actor = { member: { id: "member_1", labId: "lab_1" } };
  const store = { actor, generation: 1 };
  const service = { origin: "https://business.test" };
  const runtime = { phase: initialPhase };
  const timers = [];
  const nextSnapshot = () => ({ ...snapshot(), phase: runtime.phase });
  const values = new URLSearchParams(params);
  const navigate = (...args) => calls.push(["navigate", ...args]);
  const bridge = {
    status: async () => ({ pageReady: false, phase: "running" }),
    show: async () => {},
    taskStatus: async () => nextSnapshot(),
    taskOpen: async (target, pick) => {
      calls.push(["open", target, pick]);
      if (openWait) await openWait;
      return nextSnapshot();
    },
    taskImportTeamLibrary: async (target, selected) => {
      calls.push(["import", target, selected]);
      return { count: 2, revision: selected.revision };
    },
    taskAttachContext: async (target, chat) => {
      calls.push(["attach", target, chat]);
      if (attachFails) throw Error("Synthetic attachment failure");
      return nextSnapshot();
    },
    taskPrompt: async (...args) => {
      calls.push(["prompt", ...args]);
      if (promptFailOnce) {
        promptFailOnce = false;
        throw Error("Synthetic lost prompt response");
      }
    },
    taskStageDelivery: async (target) => {
      calls.push(["stage", target]);
      return ["delivery-savedhash/edited-result.pptx"];
    },
    taskReveal: async (...args) => calls.push(["reveal", ...args]),
  };
  const react = {
    lazy: () => "TaskInbox",
    Suspense: "Suspense",
    useState(initial) {
      const slot = index++;
      if (!(slot in hooks))
        hooks[slot] = { value: typeof initial === "function" ? initial() : initial };
      return [
        hooks[slot].value,
        (value) => {
          hooks[slot].value =
            typeof value === "function" ? value(hooks[slot].value) : value;
        },
      ];
    },
    useRef(initial) {
      const slot = index++;
      return (hooks[slot] ||= { current: initial });
    },
    useEffect(effect, deps) {
      const slot = index++,
        old = hooks[slot];
      if (!old || deps.some((dep, i) => dep !== old.deps[i])) {
        old?.cleanup?.();
        hooks[slot] = { deps };
        pendingEffects.push(() => {
          hooks[slot].cleanup = effect();
        });
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    antd: {
      Alert: "Alert",
      Button: "Button",
      Drawer: "Drawer",
      Spin: "Spin",
      Input: { TextArea: "TextArea" },
    },
    "react-router-dom": {
      Link: "Link",
      useNavigate: () => navigate,
      useSearchParams: () => [values],
    },
    "./workbench-links": {
      workbenchTaskTarget: () => ({
        id: values.get("task"),
        kind: values.get("taskKind") || "personal",
        valid: !!values.get("task"),
      }),
      workbenchTaskPath: (taskId, kind) => `/workbench?task=${taskId}&taskKind=${kind}`,
      nativeWorkbenchTaskPath: (taskId, kind) => `/dsh?task=${taskId}&taskKind=${kind}`,
    },
    "./api": {
      researchApi: async () => ({
        data: {
          task: {
            id: "task_1",
            title: "Synthetic task",
            goal: "Test evidence",
            allowedActions: ["submit"],
          },
        },
      }),
    },
    "./store": { useResearchStore: (selector) => selector(store) },
    "./team-material-selection": selection,
    "./local-dsh-context": helper,
    "./task-status-read": loadHelper("task-status-read.ts"),
    "@ant-design/icons": { ExportOutlined: "ExportIcon" },
    "./native-workbench-handoff": {
      readWorkbenchServiceOrigin: async () => service.origin,
      readNativeWorkbenchHandoff: () => ({
        chat: {
          messages: [
            {
              conversationId: "chat_1",
              messageId: "message_1",
              text: "Exact task discussion",
            },
          ],
        },
      }),
      clearNativeWorkbenchHandoff: () => calls.push(["clear"]),
    },
    "./local-dsh.scss": {},
  };
  const module = { exports: {} };
  const localStorage = {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  vm.runInNewContext(compile(source("LocalDshPage.tsx")), {
    module,
    exports: module.exports,
    require: (name) => dependencies[name],
    URLSearchParams,
    AbortController,
    localStorage,
    sessionStorage: localStorage,
    window: {
      electronAPI: { localDsh: bridge },
      location: { origin: "https://synthetic.test", get hash() { return "#/dsh?" + values; } },
      setInterval: (callback) => {
        timers.push(callback);
        return timers.length;
      },
      clearInterval() {},
    },
    clearInterval() {},
  });
  const render = () => {
    index = 0;
    tree = module.exports.LocalDshPage();
    while (pendingEffects.length) pendingEffects.shift()();
    return tree;
  };
  const settle = async () => {
    for (let step = 0; step < 16; step++) {
      await new Promise((resolve) => setImmediate(resolve));
      render();
    }
    return tree;
  };
  return {
    render,
    settle,
    calls,
    store,
    storage,
    values,
    service,
    runtime,
    timers,
    get tree() {
      return tree;
    },
  };
}

test("arrival restores exact task, imports pinned materials and attaches context without a model prompt", async () => {
  const page = host({
    params:
      "task=task_1&taskKind=research&handoff=nonce_1&teamEntry=template&teamEntry=figure&teamRevision=revision_123&teamRules=true",
  });
  page.render();
  await page.settle();
  assert.deepEqual(
    page.calls
      .filter((call) => ["open", "import", "attach"].includes(call[0]))
      .map((call) => call[0]),
    ["open", "import", "attach"],
  );
  assert.equal(page.calls.find((call) => call[0] === "open")[2], false);
  assert.equal(
    page.calls.find((call) => call[0] === "import")[2].revision,
    "revision_123",
  );
  assert.equal(
    page.calls.find((call) => call[0] === "attach")[2].messages[0].messageId,
    "message_1",
  );
  assert.equal(
    page.calls.some((call) => call[0] === "prompt"),
    false,
  );
  assert.match(text(page.tree), /已接上 · 任务背景 · 适用规范/);
  assert.match(text(page.tree), /带 1 份成果回任务/);
  assert.match(text(page.tree), /selected_git_revision/);
  assert.match(text(page.tree), /Pinned template/);
  const destination = page.calls.find((call) => call[0] === "navigate")[1];
  assert.equal(destination, "/dsh?task=task_1&taskKind=research");
});

test("failed attachment never presents a previous binding receipt as connected", async () => {
  const page = host({ attachFails: true });
  page.render();
  await page.settle();
  assert.doesNotMatch(text(page.tree), /已接上/);
  assert.match(text(page.tree), /任务背景尚未接上/);
  assert.equal(page.storage.size, 0);
});

test("an account switch fences a delayed task-open result before any context transfer", async () => {
  let release;
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  const page = host({ openWait: wait });
  page.render();
  await new Promise((resolve) => setImmediate(resolve));
  page.render();
  await new Promise((resolve) => setImmediate(resolve));
  page.store.actor = undefined;
  page.store.generation++;
  page.render();
  release();
  await page.settle();
  assert.equal(page.calls.filter((call) => call[0] === "attach").length, 0);
  assert.doesNotMatch(text(page.tree), /已接上/);
});

test("recent pointers are isolated by service, account and lab, and output candidates exclude inputs", () => {
  const key = helper.recentWorkbenchKey("https://one.test", "member_1", "lab_1");
  for (const args of [
    ["https://two.test", "member_1", "lab_1"],
    ["https://one.test", "member_2", "lab_1"],
    ["https://one.test", "member_1", "lab_2"],
  ])
    assert.notEqual(key, helper.recentWorkbenchKey(...args));
  assert.equal(
    helper.readRecentWorkbench(
      { getItem: () => '{"taskId":"../wrong","kind":"research"}' },
      key,
    ),
    undefined,
  );
  assert.deepEqual(
    Array.from(helper.workbenchOutputs(snapshot()), (item) => item.name),
    ["report.md"],
  );
});

test("saved plugin results use explicit native file selection before returning to the exact task", async () => {
  const page = host();
  page.render();
  await page.settle();
  const choose = find(
    page.tree,
    (node) => node.type === "Button" && text(node) === "选择已保存的成果",
  )[0];
  assert.ok(choose);
  assert.equal(
    page.calls.some((call) => call[0] === "stage"),
    false,
  );
  choose.props.onClick();
  await page.settle();
  const stage = page.calls.find((call) => call[0] === "stage");
  assert.equal(stage[1].taskId, "task_1");
  assert.equal(
    stage.length,
    2,
    "native picker chooses the saved result; no inferred original path",
  );
  assert.equal(
    page.calls.find((call) => call[0] === "navigate")[1],
    "/workbench?task=task_1&taskKind=research",
  );
  assert.match(text(page.tree), /保存并下载「工作副本」/);
});

test("a service change with identical actor IDs cannot attach the previous service's task", async () => {
  let release;
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  const page = host({ openWait: wait });
  page.render();
  await new Promise((resolve) => setImmediate(resolve));
  page.render();
  await new Promise((resolve) => setImmediate(resolve));
  page.service.origin = "https://other-business.test";
  release();
  await page.settle();
  assert.equal(page.calls.filter((call) => call[0] === "attach").length, 0);
  assert.equal(page.storage.size, 0);
  assert.doesNotMatch(text(page.tree), /已接上/);
});

test("sidebar restores only the service-specific recent task after verifying current server access", async () => {
  const page = host({ params: "" });
  page.storage.set(
    helper.recentWorkbenchKey("https://business.test", "member_1", "lab_1"),
    JSON.stringify({ taskId: "task_1", kind: "research" }),
  );
  page.storage.set(
    helper.recentWorkbenchKey("https://synthetic.test", "member_1", "lab_1"),
    JSON.stringify({ taskId: "wrong_renderer_task", kind: "research" }),
  );
  page.render();
  await page.settle();
  assert.equal(
    page.calls.find((call) => call[0] === "navigate")[1],
    "/dsh?task=task_1&taskKind=research",
  );
});

test("running reentry retains the exact session with its previous receipt and attaches new background after completion", async () => {
  const page = host({
    initialPhase: "running",
    params:
      "task=task_1&taskKind=research&teamEntry=template&teamRevision=pinned_revision",
  });
  page.render();
  await page.settle();
  assert.match(text(page.tree), /正在执行 · 沿用本轮已有背景/);
  assert.match(text(page.tree), /本轮开始前接入/);
  assert.doesNotMatch(text(page.tree), /已接上/);
  assert.equal(
    page.calls.some((call) => call[0] === "attach" || call[0] === "import"),
    false,
  );
  assert.equal(page.calls.find((call) => call[0] === "open")[2], false);
  page.runtime.phase = "finished";
  await Promise.all(page.timers.map((callback) => callback()));
  await page.settle();
  assert.equal(page.calls.filter((call) => call[0] === "attach").length, 1);
  assert.equal(
    page.calls.find((call) => call[0] === "import")[2].revision,
    "pinned_revision",
  );
  assert.match(text(page.tree), /已接上/);
});

const draftActor = {
  memberId: "member_1",
  labId: "lab_1",
  generation: 1,
  serviceOrigin: "https://business.test",
};
const draftTarget = { kind: "research", taskId: "task_1" };
function addDraft(page) {
  const key = helper.workbenchInstructionKey(draftActor, draftTarget);
  const storage = {
    setItem: (key, value) => page.storage.set(key, value),
    removeItem: (key) => page.storage.delete(key),
  };
  helper.storeWorkbenchInstruction(
    storage,
    key,
    "Use the selected template and figures",
  );
  return key;
}
test("material instructions remain a draft until explicit send and a lost response retries the same request once", async () => {
  const page = host({ promptFailOnce: true });
  const key = addDraft(page);
  page.render();
  await page.settle();
  assert.equal(
    page.calls.some((call) => call[0] === "prompt"),
    false,
  );
  assert.equal(
    find(page.tree, (node) => node.type === "TextArea")[0].props.value,
    "Use the selected template and figures",
  );
  const send = () =>
    find(
      page.tree,
      (node) => node.type === "Button" && text(node) === "发送到任务会话",
    )[0];
  send().props.onClick();
  send().props.onClick();
  await page.settle();
  assert.equal(page.calls.filter((call) => call[0] === "prompt").length, 1);
  assert.ok(
    page.storage.has(key),
    "failure preserves the exact draft and request identity",
  );
  send().props.onClick();
  await page.settle();
  const prompts = page.calls.filter((call) => call[0] === "prompt");
  assert.equal(prompts.length, 2);
  assert.equal(prompts[0][1].taskId, "task_1");
  assert.equal(prompts[0][2], "Use the selected template and figures");
  assert.equal(prompts[0][3], prompts[1][3]);
  assert.equal(page.storage.has(key), false);
  assert.equal(send(), undefined, "success removes the sending action");
  await page.settle();
  assert.equal(page.calls.filter((call) => call[0] === "prompt").length, 2);
});

test("instruction drafts are isolated across generation, actor, service, lab and task; expired drafts never restore", async () => {
  const key = helper.workbenchInstructionKey(draftActor, draftTarget);
  for (const changed of [
    { generation: 2 },
    { memberId: "member_2" },
    { labId: "lab_2" },
    { serviceOrigin: "https://other.test" },
  ])
    assert.notEqual(
      helper.workbenchInstructionKey({ ...draftActor, ...changed }, draftTarget),
      key,
    );
  assert.notEqual(
    helper.workbenchInstructionKey(draftActor, { ...draftTarget, taskId: "task_2" }),
    key,
  );
  assert.notEqual(
    helper.workbenchInstructionKey(draftActor, { ...draftTarget, kind: "personal" }),
    key,
  );
  const page = host();
  addDraft(page);
  page.render();
  await page.settle();
  page.store.generation = 2;
  page.render();
  await page.settle();
  assert.equal(find(page.tree, (node) => node.type === "TextArea").length, 0);
  assert.equal(
    page.calls.some((call) => call[0] === "prompt"),
    false,
  );
  assert.equal(
    helper.readWorkbenchInstruction(
      {
        getItem: () =>
          JSON.stringify({
            version: 1,
            text: "expired",
            requestId: "request_1",
            createdAt: Date.now() - 16 * 60 * 1000,
          }),
      },
      key,
    ),
    undefined,
  );
});
