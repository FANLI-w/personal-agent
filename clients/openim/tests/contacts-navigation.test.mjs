import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function fixture() {
  const state = [];
  let cursor = 0, params = new URLSearchParams();
  const jsx = (type, props) => ({ type, props });
  const actor = { generation: 1, actor: { member: { id: "synthetic-member" } } };
  const imports = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: {
      lazy: () => "Skills", Suspense: "Suspense", useEffect() {}, useLayoutEffect() {},
      useRef: value => ({ current: value }),
      useState(initial) {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
      },
    },
    antd: Object.fromEntries(["Alert", "Button", "Input", "Modal", "Segmented", "Tabs"].map(name => [name, name])),
    "react-router-dom": { useNavigate: () => () => {}, useSearchParams: () => [params, next => { params = next; }] },
    "./store": { useResearchStore: Object.assign(selector => selector(actor), { getState: () => actor }) },
    "./useResearchRead": { useResearchRead: () => ({ data: { data: [], nextCursor: null }, refresh() {}, refreshChecked() {} }) },
    "./useContactStars": { useContactStars: () => ({ ids: [] }) },
    "./usePersonalOperation": { usePersonalOperation: () => ({ capture: () => ({ isCurrent: () => true }) }) },
    "./useResearchContactChat": { useResearchContactChat: () => () => {} },
    "./contact-directory": { sortDirectoryContacts: value => value },
  };
  const source = await readFile(new URL("../src/research/ResearchContacts.tsx", import.meta.url), "utf8");
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { module, exports: module.exports, URLSearchParams,
    require: name => imports[name] || new Proxy({}, { get: (_, key) => String(key) }),
  });
  return { render() { cursor = 0; return module.exports.ResearchContacts(); } };
}

function nodes(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
const text = node => !node ? "" : Array.isArray(node) ? node.map(text).join("") : typeof node === "object" ? text(node.props?.children) : String(node);
const find = (tree, predicate) => nodes(tree).find(predicate);
const button = (tree, label) => find(tree, node => ["button", "Button"].includes(node.type) && text(node) === label);

test("directory opens people search without specialist tabs or creation", async () => {
  const f = await fixture();
  const tree = f.render();
  assert(button(tree, "好友申请"));
  assert(button(tree, "群邀请"));
  assert.equal(button(tree, "智能体"), undefined);
  assert.equal(button(tree, "添加智能体"), undefined);
  assert.match(text(tree), /选择一位联系人/);
  button(tree, "添加联系人").props.onClick();
  const modal = find(f.render(), node => node.type === "Modal");
  assert.equal(modal.props.open, true);
  assert.equal(modal.props.children.props.kind, "people");
});
