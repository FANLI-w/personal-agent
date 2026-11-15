import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (file) => readFile(new URL(file, import.meta.url), "utf8");

test("the task page leads with goal and acceptance, not a next-step banner", async () => {
  const page = await read("../src/research/TaskWorkPage.tsx");
  assert.doesNotMatch(page, /task-work-next/);
  assert.doesNotMatch(page, />\s*下一步\s*</);
  assert.match(page, /验收标准/);
  assert.match(page, /逐条对照，全部满足才算完成/);
  assert.match(page, /checklist/);
  // Only a real blocker keeps an action row, and it is not called a next step.
  assert.match(page, /className="task-work-start"/);
  assert.match(page, /开始这一步/);
});

test("task delivery has one area and keeps server review history beside the files", async () => {
  const page = await read("../src/research/TaskWorkPage.tsx");
  const panel = await read("../src/research/TaskDeliveryPanel.tsx");
  assert.equal((page.match(/<TaskDeliveryPanel/g) || []).length, 1);
  assert.doesNotMatch(page, /title="成果与提交"|提交这些文件/);
  assert.match(page, /aria-label="交付成果"/);
  assert.match(page, /binding\.sources \|\| \[\]\)\.map/);
  assert.match(page, /binding\.localMaterials \|\| \[\]\)\.map/);
  assert.match(page, /latestAccepted/);
  assert.match(page, /personalResult\.summary/);
  const personal = await read("../src/research/PersonalWorkDetail.tsx");
  assert.match(personal, /task.result && !embedded/);
  assert.match(personal, /!embedded \|\| !window.electronAPI/);
  assert.match(page, /TaskDeliveryDownload/);
  assert.match(page, /delivery\.review\.comment/);
  assert.match(page, /taskRebase/);
  assert.match(panel, /setSelection\(names\)/);
  assert.doesNotMatch(panel, /if \(direct\) await submit/);
  assert.match(panel, /确认提交/);
  assert.match(page, /取用共享资料（可选）/);
  assert.match(page, /归档到资料（可选）/);
});

test("the schedule section no longer repeats acceptance and shows labelled dates", async () => {
  const page = await read("../src/research/TaskWorkPage.tsx");
  assert.match(page, /title="安排"/);
  assert.doesNotMatch(page, /title="安排与验收"/);
  const panel = await read("../src/research/ResearchTaskPanel.tsx");
  // A labelled schedule replaces the unlabelled line.
  assert.match(panel, /research-task-schedule/);
  assert.match(panel, /label: "建议"/);
  assert.match(panel, /label: "承诺"/);
  assert.match(panel, /label: "截止"/);
  // Uploading and submitting happen once, in 成果与提交, not twice.
  assert.match(panel, /allowed\("upload"\) && !embedded/);
  assert.match(panel, /allowed\("submit"\) && !embedded/);
});

test("rules are summarised instead of asking for more input", async () => {
  const panel = await read("../src/research/TaskKnowledgePanel.tsx");
  assert.match(panel, /当前可用：平台规则/);
  assert.match(panel, /上轮实际带入/);
  assert.match(panel, /看具体规则/);
  // No more search box, no add/edit editor, no rule history in this panel.
  assert.doesNotMatch(panel, /搜索规则、记忆/);
  assert.doesNotMatch(panel, /新增规则或记忆/);
  assert.doesNotMatch(panel, /aria-label="规则标题"/);
  assert.doesNotMatch(panel, /管理我的记忆/);
});

// Execute the actual work page against returned service snapshots. Transport and
// the React host are controlled; no account data or desktop IPC is touched.
async function renderWorkPage({ kind = "research", status = "completed", deliveries = [], result } = {}) {
  const ts = (await import("typescript")).default;
  const vm = await import("node:vm");
  const source = await read("../src/research/TaskWorkPage.tsx");
  const task = { id: "synthetic_task", title: "Synthetic report", goal: "Compare the evidence", acceptanceCriteria: "Show source limitations", version: 3, status, allowedActions: [], ...(kind === "personal" ? { result } : {}) };
  const jsx = (type, props) => typeof type === "function" ? type(props) : { type, props };
  const dependencies = {
    react: { useState: value => [value, () => {}], useRef: value => ({ current: value }), useEffect() {} },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "react-router-dom": { useNavigate: () => () => {}, Link: "Link" },
    antd: { Alert: "Alert", Button: "Button", Checkbox: "Checkbox", Input: { TextArea: "TextArea" }, Select: "Select" },
    "./api": { researchApi: async () => { throw Error("render must not write"); } },
    "./useResearchRead": { useResearchRead: (_read, key) => ({ data: key.startsWith("work-page:") ? { task, artifacts: [], deliverables: deliveries } : undefined, refresh: async () => {} }) },
    "./usePersonalOperation": { usePersonalOperation: () => ({ scope: "synthetic", capture: () => ({ isCurrent: () => true }) }) },
    "./task-dsh-events": { taskEventRows: () => [] },
    "./task-planning": { taskStateLabels: { completed: "已验收" } },
    "./workspace-labels": { workspaceStatusLabel: { completed: "已完成" } },
  };
  const module = { exports: {} };
  const context = { module, exports: module.exports, window: {}, require: name => dependencies[name] || new Proxy({}, { get: (_, key) => String(key) }) };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  return module.exports.TaskWorkPage({ taskId: task.id, kind, onChanged: async () => {}, children: () => "Arrangement controls" });
}
function renderText(node) {
  if (Array.isArray(node)) return node.map(renderText).join(" ");
  if (node && typeof node === "object") return [node.props?.text || "", renderText(node.props?.children)].join(" ");
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
const delivery = (revision, decision) => ({ id: `delivery_${revision}`, revision, summary: `Report revision ${revision}`, artifactRefs: [], sources: [{ label: `report-v${revision}.pdf`, locator: "synthetic" }], review: { decision, comment: `Review ${revision}` } });
test("a completed task shows its reviewed delivery and keeps an empty work area collapsed", async () => {
  const text = renderText(await renderWorkPage({ deliveries: [delivery(1, "accepted")] }));
  assert.match(text, /已验收第\s+1\s+版\s+· report-v1.pdf/);
  assert.match(text, /Report revision 1/);
  assert.match(text, /Review 1/);
  assert.doesNotMatch(text, /开始任务后，这里会出现本机工作区/);
  assert.doesNotMatch(text, /暂无可查看的交付记录/);
});
test("an older accepted revision cannot certify the latest unaccepted delivery", async () => {
  const text = renderText(await renderWorkPage({ deliveries: [delivery(1, "accepted"), delivery(2, "changes_requested")] }));
  assert.match(text, /已结束 · 验收记录待核对/);
  assert.match(text, /要求修改/);
});
test("personal accepted text results stay visible in the single delivery area without a local receipt", async () => {
  const text = renderText(await renderWorkPage({ kind: "personal", result: { accepted: true, summary: "Synthetic accepted text" } }));
  assert.match(text, /已验收结果/);
  assert.match(text, /Synthetic accepted text/);
  assert.doesNotMatch(text, /暂无可查看的交付记录/);
  assert.doesNotMatch(text, /开始任务后，这里会出现本机工作区/);
});

async function statusHost(readStatus) {
  const ts = (await import("typescript")).default;
  const vm = await import("node:vm");
  const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const statusModule = { exports: {} };
  vm.runInNewContext(compile(await read("../src/research/task-status-read.ts")), {
    module: statusModule, exports: statusModule.exports, Error, URLSearchParams,
  });
  const slots = [], effects = [], timers = [];
  let cursor = 0, reads = 0;
  const location = { hash: "#/workbench?view=tasks&task=synthetic_task&taskKind=research" };
  const jsx = (type, props) => typeof type === "function" ? type(props) : { type, props };
  const dependencies = {
    react: {
      useState(initial) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = initial;
        return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
      },
      useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
      useEffect(effect, deps) {
        const index = cursor++, old = slots[index];
        if (!old || deps.some((dep, i) => dep !== old.deps[i])) {
          old?.cleanup?.();
          slots[index] = { deps };
          effects.push(() => { slots[index].cleanup = effect(); });
        }
      },
    },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "react-router-dom": { useNavigate: () => () => {}, Link: "Link" },
    antd: { Alert: "Alert", Button: "Button", Checkbox: "Checkbox", Input: { TextArea: "TextArea" }, Select: "Select" },
    "./usePersonalOperation": { usePersonalOperation: () => ({ scope: "synthetic", capture: () => ({ isCurrent: () => true }) }) },
    "./useResearchRead": { useResearchRead: (_read, key) => ({ data: key.startsWith("work-page:") ? { task: { id: "synthetic_task", title: "Synthetic task", status: "completed", allowedActions: [] }, artifacts: [], deliverables: [] } : undefined, refresh: async () => {} }) },
    "./task-dsh-events": { taskEventRows: () => [] },
    "./task-planning": { taskStateLabels: {} },
    "./workspace-labels": { workspaceStatusLabel: {} },
    "./task-status-read": statusModule.exports,
  };
  const module = { exports: {} };
  vm.runInNewContext(compile(await read("../src/research/TaskWorkPage.tsx")), {
    module, exports: module.exports,
    require: name => dependencies[name] || new Proxy({}, { get: (_, key) => String(key) }),
    window: { location, electronAPI: { localDsh: { taskStatus: async () => { ++reads; return readStatus(); } } }, setInterval: callback => { timers.push(callback); return timers.length; } },
    clearInterval() {},
  });
  const render = () => {
    cursor = 0;
    const tree = module.exports.TaskWorkPage({ taskId: "synthetic_task", kind: "research", onChanged: async () => {}, children: () => "Arrangement" });
    while (effects.length) effects.shift()();
    return tree;
  };
  return { render, location, timers, get reads() { return reads; }, helper: statusModule.exports };
}
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object") return [];
  return [node, ...nodes(node.props?.children)];
}
const settleStatus = () => new Promise(resolve => setImmediate(resolve));

test("a pending IPC rejection cannot follow query-only navigation to the team page", async () => {
  let reject;
  const host = await statusHost(() => new Promise((_, no) => { reject = no; }));
  host.render();
  assert.equal(host.reads, 1);
  host.location.hash = "#/workbench?view=team";
  reject(Error("Error invoking remote method 'task-dsh-status': Error: 请在对应任务工作页操作。"));
  await settleStatus();
  for (const timer of host.timers) await timer();
  assert.equal(host.reads, 1);
  assert.equal(nodes(host.render()).some(node => node.type === "Alert" && node.props.type === "warning"), false);
});
test("current task IPC failures retain the actual cause and recover without a false connection claim", async () => {
  let fail = true;
  const host = await statusHost(async () => {
    if (fail) throw Error("Error invoking remote method 'task-dsh-status': Error: 任务服务请求超时，请重试原操作。");
    return undefined;
  });
  host.render();
  await settleStatus();
  let tree = host.render();
  const alert = nodes(tree).find(node => node.type === "Alert" && node.props.type === "warning");
  assert.equal(alert.props.message, "暂时无法读取这项任务的本机进度");
  assert.equal(alert.props.description, "任务服务请求超时，请重试原操作。");
  assert.doesNotMatch(renderText(tree), /连接中断/);
  fail = false;
  await host.timers[0]();
  tree = host.render();
  assert.equal(nodes(tree).some(node => node.type === "Alert" && node.props.type === "warning"), false);
});
test("status reads require the exact task and kind on either supported route", async () => {
  const host = await statusHost(async () => undefined);
  const match = host.helper.taskStatusRouteMatches;
  const target = { taskId: "synthetic_task", kind: "research" };
  assert.equal(match("#/dsh?task=synthetic_task&taskKind=research", target), true);
  assert.equal(match("#/workbench?view=team&task=synthetic_task&taskKind=research", target), true);
  assert.equal(match("#/workbench?task=synthetic_task&taskKind=personal", target), false);
  assert.equal(match("#/workbench?task=another_task&taskKind=research", target), false);
  assert.equal(match("#/workbench?view=team", target), false);
});
