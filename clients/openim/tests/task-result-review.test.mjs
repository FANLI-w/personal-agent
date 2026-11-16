import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
const source = await readFile(new URL("../src/research/TaskResultReview.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function host({ kind = "research", supportsComment = true, post = async () => {} } = {}) {
  const slots = [], calls = [], dialogs = [];
  let cursor = 0, active = true, changed = 0;
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    react: { useState(value) { const at = cursor++; if (!(at in slots)) slots[at] = value; return [slots[at], value => { slots[at] = value; }]; }, useRef(value) { const at = cursor++; return slots[at] ||= { current: value }; } },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    antd: { App: { useApp: () => ({ modal: { confirm: options => dialogs.push(options) } }) }, Button: "Button", Input: { TextArea: "TextArea" } },
    "./api": { researchApi: async (name, input) => { calls.push(JSON.parse(JSON.stringify({ name, input }))); await post(); } },
    "./usePersonalOperation": { usePersonalOperation: () => ({ capture: () => ({ isCurrent: () => active }) }) },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, Error, require: name => dependencies[name] });
  const props = { target: { kind, taskId: "task_synthetic" }, taskVersion: 17, ...(kind === "personal" ? { messageId: "message_exact" } : { delivery: { id: "delivery_exact", version: 4, revision: 3 } }), supportsComment, onChanged: async () => { changed++; } };
  return { calls, dialogs, props, get changed() { return changed; }, deactivate: () => { active = false; }, render: () => { cursor = 0; return module.exports.TaskResultReview(props); } };
}
function nodes(tree) { if (Array.isArray(tree)) return tree.flatMap(nodes); if (!tree || typeof tree !== "object") return []; return [tree, ...nodes(tree.props?.children)]; }
const button = (tree, label) => nodes(tree).find(node => node.type === "Button" && node.props.children === label);
const comment = (h, text) => nodes(h.render()).find(node => node.type === "TextArea").props.onChange({ target: { value: text } });
test("team review binds feedback to the displayed delivery revision and both current versions", async () => {
  const h = host(); assert.equal(button(h.render(), "确认验收").props.disabled, true);
  comment(h, " Check the source evidence "); button(h.render(), "要求修改").props.onClick();
  assert.deepEqual(h.calls, []); await h.dialogs[0].onOk();
  assert.deepEqual(h.calls, [{ name: "review", input: { params: { id: "delivery_exact" }, body: { expectedVersion: 4, expectedTaskVersion: 17, revision: 3, decision: "changes_requested", comment: "Check the source evidence" } } }]);
  assert.equal(h.changed, 1);
});
test("personal review saves feedback against the exact canonical message", async () => {
  const h = host({ kind: "personal" }); comment(h, "The evidence is sufficient"); button(h.render(), "确认验收").props.onClick(); await h.dialogs[0].onOk();
  assert.deepEqual(h.calls[0], { name: "reviewPersonalWorkResult", input: { params: { id: "task_synthetic" }, body: { expectedVersion: 17, messageId: "message_exact", decision: "accept", comment: "The evidence is sufficient" } } });
});
test("old personal servers retain the exact original review request shape", async () => {
  const h = host({ kind: "personal", supportsComment: false }); assert.equal(nodes(h.render()).some(node => node.type === "TextArea"), false);
  button(h.render(), "确认验收").props.onClick(); await h.dialogs[0].onOk(); assert.equal("comment" in h.calls[0].input.body, false);
});
test("navigation invalidates an already opened review confirmation", async () => {
  const h = host({ kind: "personal" }); button(h.render(), "确认验收").props.onClick(); h.deactivate(); await h.dialogs[0].onOk(); assert.deepEqual(h.calls, []);
});
test("review conflicts preserve feedback without claiming completion", async () => {
  const h = host({ post: async () => { throw Error("Version changed"); } }); comment(h, "Review must survive"); button(h.render(), "确认验收").props.onClick(); await h.dialogs[0].onOk();
  assert.equal(h.changed, 0); assert.equal(nodes(h.render()).find(node => node.type === "TextArea").props.value, "Review must survive"); assert.ok(nodes(h.render()).some(node => node.props?.role === "alert" && node.props.children === "Version changed"));
});
