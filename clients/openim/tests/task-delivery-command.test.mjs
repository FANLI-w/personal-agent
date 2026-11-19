import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("vite"))("esbuild");
const result = await esbuild.build({ entryPoints: [fileURLToPath(new URL("../src/research/task-delivery-command.ts", import.meta.url))], bundle: true, write: false, format: "esm", platform: "node" });
const { prepareTaskDelivery, deliveryReceiptLabel, deliveryDisplaySummary } = await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));
const files = ["delivery-a/报告.pdf", "delivery-b/实验图.png"];
test("submission matching never silently drops an explicitly missing file", () => {
  assert.deepEqual(prepareTaskDelivery("把报告.pdf和不存在.pdf提交到这项任务", "组会", files, []).names, []);
  assert.deepEqual(prepareTaskDelivery("把不存在.pdf提交", "组会", [files[0]], []).names, []);
  assert.deepEqual(prepareTaskDelivery("把报告.pdf和实验图.png提交", "组会", files, []).names, files);
});
test("cancellation and another task cannot produce a confirmation", () => {
  assert.deepEqual(prepareTaskDelivery("不要提交报告.pdf", "组会", files, []).names, []);
  assert.deepEqual(prepareTaskDelivery("把报告.pdf交到论文任务", "组会", files, []).names, []);
  assert.deepEqual(prepareTaskDelivery("报告.pdf在哪里", "组会", files, []).names, []);
});
test("attached snapshots survive a generic instruction, same-name versions need a choice", () => {
  assert.deepEqual(prepareTaskDelivery("帮我交一下", "组会", [], [files[0]]).names, [files[0]]);
  assert.deepEqual(prepareTaskDelivery("提交报告.pdf", "组会", [files[0], "delivery-c/报告.pdf"], []).names, []);
});
test("the parsed filename must match in full, including after common request phrases", () => {
  const groupReport = "team/组会报告.pdf";
  const shorter = "local/报告.pdf";
  const known = [shorter, groupReport];
  assert.deepEqual(prepareTaskDelivery("把组会报告.pdf提交到这项任务", "组会", known, []).names, [groupReport]);
  assert.deepEqual(prepareTaskDelivery("帮我交组会报告.pdf", "组会", known, []).names, [groupReport]);
  assert.deepEqual(prepareTaskDelivery("把「组会报告.pdf」交到「项目周报」", "项目周报", known, []).names, [groupReport]);
  assert.deepEqual(prepareTaskDelivery("把「组会报告.pdf」交到「组会报告.pdf」", "组会报告.pdf", known, []).names, [groupReport]);
  assert.deepEqual(prepareTaskDelivery("把组会报告.pdf提交", "组会", [shorter], []).names, []);
  assert.deepEqual(prepareTaskDelivery("把其他组会报告.pdf提交", "组会", known, []).names, []);
  assert.deepEqual(prepareTaskDelivery("把组会报告.pdf和报告.pdf提交", "组会", known, []).names, [groupReport, shorter]);
});
test("a saved submission receipt follows the actual service review status", () => {
  assert.equal(deliveryReceiptLabel("in_review"), "已提交，等待验收");
  assert.equal(deliveryReceiptLabel("awaiting_review"), "已提交，等待验收");
  assert.equal(deliveryReceiptLabel("completed"), "成果已验收");
  assert.equal(deliveryReceiptLabel("changes_requested"), "上版已退回，请修改后再提交");
  assert.equal(deliveryReceiptLabel("running"), "上次提交记录");
  assert.equal(deliveryReceiptLabel(""), "上次提交记录");
});

// Run the actual component and delivery matching code with a controlled React
// host. Only the DOM components and the caller's IPC callbacks are substituted.
const panelBuild = await esbuild.build({
  entryPoints: [fileURLToPath(new URL("../src/research/TaskDeliveryPanel.tsx", import.meta.url))],
  bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic",
  external: ["react", "react/jsx-runtime", "antd", "@ant-design/icons"],
});
function panelHost(overrides = {}) {
  const slots = [];
  let cursor = 0;
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    react: {
      useState(initial) {
        const at = cursor++;
        if (!(at in slots)) slots[at] = initial;
        return [slots[at], value => { slots[at] = typeof value === "function" ? value(slots[at]) : value; }];
      },
      useRef(initial) {
        const at = cursor++;
        if (!(at in slots)) slots[at] = { current: initial };
        return slots[at];
      },
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    antd: { Alert: "Alert", Button: "Button", Input: { TextArea: "TextArea", Search: "Search" } },
    "@ant-design/icons": { CloudUploadOutlined: "UploadIcon", MessageOutlined: "MessageIcon", PaperClipOutlined: "AttachIcon" },
  };
  const module = { exports: {} };
  vm.runInNewContext(panelBuild.outputFiles[0].text, { module, exports: module.exports, Error, window: { electronAPI: { getFilePath: file => file.path } }, require: name => {
    assert.ok(name in dependencies, `Unexpected component dependency: ${name}`);
    return dependencies[name];
  } });
  const props = {
    target: { kind: "research", taskId: "synthetic_task" }, title: "Synthetic task",
    outputs: [{ name: "report.pdf", size: 123 }], disabled: false, canSubmit: true,
    stage: async () => { throw Error("Unexpected file selection"); },
    submit: async () => { throw Error("Unexpected new submission"); },
    retry: async () => { throw Error("Unexpected pending replay"); },
    ...overrides,
  };
  const render = () => { cursor = 0; return module.exports.TaskDeliveryPanel(props); };
  return { props, render };
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props?.children), ...nodes(tree.props?.action)];
}
function button(tree, name) {
  return nodes(tree).find(node => node.type === "Button" && node.props.children === name);
}
const settle = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));

test("personal tasks preserve exact text submission alongside file selection", async () => {
  const calls = [];
  const host = panelHost({ target: { kind: "personal", taskId: "synthetic_personal" }, submit: async (...args) => calls.push(plain(args)) });
  let tree = host.render();
  assert.equal(nodes(tree).some(node => node.props?.className === "task-delivery-output-options"), true);
  assert.equal(button(tree, "确认提交"), undefined);
  assert.ok(button(tree, "选择文件"));
  assert.ok(button(tree, "让助理帮我交"));
  nodes(tree).find(node => node.type === "TextArea").props.onChange({ target: { value: "  Exact personal result\nwith evidence.  " } });
  tree = host.render();
  assert.equal(button(tree, "提交文字成果").props.disabled, false);
  button(tree, "提交文字成果").props.onClick();
  await settle();
  assert.deepEqual(calls, [[[], "Exact personal result\nwith evidence."]]);
  assert.equal(nodes(host.render()).find(node => node.type === "TextArea").props.value, "");
});

test("personal tasks can explicitly confirm a selected file", async () => {
  const calls = [];
  const host = panelHost({ target: { kind: "personal", taskId: "synthetic_personal" }, submit: async names => calls.push(plain(names)) });
  button(host.render(), "选择全部产出").props.onClick();
  assert.ok(button(host.render(), "确认提交"));
  assert.deepEqual(calls, []);
  button(host.render(), "确认提交").props.onClick();
  await settle();
  assert.deepEqual(calls, [["report.pdf"]]);
});

test("research file staging requires an explicit confirmation and retains selection on failure", async () => {
  const calls = [];
  let fail = true;
  const host = panelHost({
    stage: async () => ["delivery-snapshot/report.pdf"],
    submit: async names => { calls.push(plain(names)); if (fail) throw Error("Synthetic lost connection"); },
  });
  button(host.render(), "选择文件").props.onClick();
  await settle();
  assert.deepEqual(calls, []);
  button(host.render(), "确认提交").props.onClick();
  await settle();
  let tree = host.render();
  assert.ok(button(tree, "确认提交"));
  assert.ok(nodes(tree).some(node => node.type === "Alert" && node.props.message === "Synthetic lost connection"));
  fail = false;
  button(tree, "确认提交").props.onClick();
  await settle();
  assert.deepEqual(calls, [["delivery-snapshot/report.pdf"], ["delivery-snapshot/report.pdf"]]);
  assert.equal(button(host.render(), "确认提交"), undefined);
});

const staged = (token, name) => `delivery-${token.repeat(64)}/${name}`;
const drop = (host, paths) =>
  nodes(host.render()).find(node => node.props?.onDrop).props.onDrop({
    preventDefault() {},
    dataTransfer: { files: paths.map(path => ({ path })) },
  });
const prepare = (host, text) => {
  nodes(host.render()).find(node => node.type === "Search").props.onChange({ target: { value: text } });
  nodes(host.render()).find(node => node.type === "Search").props.onSearch();
};
function textOf(node) {
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  return node?.props ? textOf(node.props.children) : typeof node === "string" ? node : "";
}

test("successive drops keep the selected files, deduplicate by staged name, and enforce the total limit", async () => {
  const deliveries = [], batches = [];
  const paths = {
    a: staged("a", "a.pdf"), b: staged("b", "b.pdf"), c: staged("c", "c.pdf"),
    d: staged("d", "d.pdf"), e: staged("e", "e.pdf"), f: staged("f", "f.pdf"), g: staged("1", "g.pdf"),
  };
  const host = panelHost({
    stage: async selected => { batches.push(plain(selected)); return selected.map(name => paths[name]); },
    submit: async names => deliveries.push(plain(names)),
  });
  drop(host, ["a", "b", "a"]); await settle();
  assert.deepEqual(batches, [["a", "b"]]);
  button(host.render(), "让助理帮我交").props.onClick();
  prepare(host, "提交a.pdf");
  drop(host, ["c", "a"]); await settle();
  drop(host, ["d", "e", "f"]); await settle();
  drop(host, ["g"]); await settle();
  const tree = host.render();
  assert.match(nodes(tree).find(node => node.type === "Alert").props.message, /最多提交 5 份文件/);
  const removeD = nodes(tree).find(node => node.type === "Button" && node.props["aria-label"]?.startsWith("移除 d.pdf"));
  removeD.props.onClick();
  drop(host, ["g"]); await settle();
  button(host.render(), "确认提交").props.onClick(); await settle();
  assert.deepEqual(deliveries, [[paths.a, paths.c, paths.e, paths.f, paths.g]]);
});

test("same-name versions show origin, size, identity, and reveal the exact path before confirmation", async () => {
  const draft = staged("a", "报告.pdf"), updated = staged("b", "报告.pdf"), chart = "results/chart.png";
  const revealed = [], delivered = [];
  const host = panelHost({
    outputs: [{ name: draft, size: 2048 }, { name: updated, size: 2048 }, { name: chart, size: 32 }],
    revealFile: name => revealed.push(name),
    submit: async names => delivered.push(plain(names)),
  });
  button(host.render(), "让助理帮我交").props.onClick();
  prepare(host, "提交报告.pdf和chart.png");
  const choiceTree = host.render();
  assert.equal(button(choiceTree, "确认提交"), undefined);
  const choices = nodes(choiceTree).filter(node => node.props?.className === "task-delivery-choice");
  assert.equal(choices.length, 2);
  assert.match(textOf(choices[0]), /报告.pdf.*从电脑选入 · 2.0 KiB · 版本 aaaaaaaaaaaa/);
  assert.match(textOf(choices[1]), /报告.pdf.*从电脑选入 · 2.0 KiB · 版本 bbbbbbbbbbbb/);
  button(choices[1], "在文件夹中查看").props.onClick();
  assert.deepEqual(revealed, [updated]);
  nodes(choices[1]).find(node => node.type === "Button").props.onClick();
  const confirmTree = host.render();
  assert.match(textOf(confirmTree), /chart.png.*报告.pdf.*版本 bbbbbbbbbbbb/);
  button(confirmTree, "确认提交").props.onClick(); await settle();
  assert.deepEqual(delivered, [[chart, updated]]);
});

test("a pending lost acknowledgement replays exactly once without a new submit grant", async () => {
  const original = { summary: "Original recorded result", names: ["delivery-snapshot/report.pdf"] };
  const calls = [];
  let finish;
  const host = panelHost({
    pending: true, disabled: true, canSubmit: false, currentStatus: "in_review",
    retry: async () => { calls.push(plain(original)); await new Promise(resolve => { finish = resolve; }); },
  });
  let tree = host.render();
  const retry = button(tree, "核对并重试");
  assert.equal(retry.props.disabled, false);
  assert.equal(button(tree, "确认提交"), undefined);
  assert.equal(button(tree, "选择文件"), undefined);
  retry.props.onClick();
  retry.props.onClick();
  assert.deepEqual(calls, [original]);
  tree = host.render();
  assert.equal(button(tree, "核对并重试").props.disabled, true);
  button(tree, "核对并重试").props.onClick();
  assert.deepEqual(calls, [original]);
  finish();
  await settle();
  assert.equal(button(host.render(), "核对并重试").props.loading, false);
});

test("new research submissions still require permission and respect the disabled guard", async () => {
  let stages = 0, submissions = 0;
  const host = panelHost({ stage: async () => { stages++; return ["report.pdf"]; }, submit: async () => { submissions++; } });
  button(host.render(), "选择全部产出").props.onClick();
  host.props.disabled = true;
  let tree = host.render();
  assert.equal(button(tree, "确认提交").props.disabled, true);
  button(tree, "确认提交").props.onClick();
  button(tree, "选择文件").props.onClick();
  await settle();
  assert.equal(stages, 0);
  assert.equal(submissions, 0);
  host.props.disabled = false;
  host.props.canSubmit = false;
  tree = host.render();
  assert.equal(button(tree, "确认提交"), undefined);
  assert.equal(button(tree, "选择文件"), undefined);
  assert.equal(button(tree, "核对并重试"), undefined);
  assert.equal(submissions, 0);
});

test("summaries show delivered filenames without integrity staging paths", () => {
  assert.equal(deliveryDisplaySummary(`Submitted delivery-${"a".repeat(64)}/report.pdf and delivery-${"b".repeat(64)}\\chart.png`), "Submitted report.pdf and chart.png");
});
test("personal result text and assistant file instructions do not overwrite each other", async () => {
  const calls = [], host = panelHost({ target: { kind: "personal", taskId: "personal_synthetic" }, submit: async (...args) => calls.push(plain(args)) });
  nodes(host.render()).find(node => node.type === "TextArea").props.onChange({ target: { value: "Actual personal findings" } });
  button(host.render(), "让助理帮我交").props.onClick();
  nodes(host.render()).find(node => node.type === "Search").props.onChange({ target: { value: "Submit report.pdf" } });
  assert.equal(nodes(host.render()).find(node => node.type === "TextArea").props.value, "Actual personal findings");
  button(host.render(), "提交文字成果").props.onClick(); await settle();
  assert.deepEqual(calls, [[[], "Actual personal findings"]]);
  assert.equal(nodes(host.render()).find(node => node.type === "Search").props.value, "Submit report.pdf");
});

test("old personal services show their upgrade requirement and preserve text delivery", () => {
  const host = panelHost({ target: { kind: "personal", taskId: "personal_synthetic" }, filesSupported: false });
  const tree = host.render();
  assert.equal(button(tree, "选择文件"), undefined);
  assert.ok(button(tree, "提交文字成果"));
  assert.ok(nodes(tree).some(node => node.type === "Alert" && /升级配套后台/.test(node.props.message)));
});
