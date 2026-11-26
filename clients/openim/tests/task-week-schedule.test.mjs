import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const text = await readFile(
  new URL("../src/research/TaskWeekSchedule.tsx", import.meta.url),
  "utf8",
);
const module = { exports: {} };
const jsx = (type, props) => ({ type, props });
let day;
const imports = {
  react: {
    useEffect: () => {},
    useState: (init) => [
      day ?? init(),
      (next) => {
        day = next;
      },
    ],
  },
  "react/jsx-runtime": { jsx, jsxs: jsx },
  "@ant-design/icons": {},
  antd: { Button: "Button" },
};
vm.runInNewContext(
  ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText,
  { module, exports: module.exports, require: (name) => imports[name] },
);
const { TaskWeekSchedule, taskDate, taskSchedule, taskDeadline } = module.exports;
const walk = (node) =>
  Array.isArray(node)
    ? node.flatMap(walk)
    : node && typeof node === "object"
    ? [node, ...walk(node.props.children)]
    : [];
const date = (date) => ({ kind: "date", date, timezone: "Asia/Shanghai" });
const dated = (dateValue, confirmed, source = "user") => ({
  value: dateValue,
  source,
  confirmed,
});

test("weekly scheduling uses confirmed commitments and preserves date-only values", () => {
  const suggestion = dated(date("2026-11-25"), false, "suggestion");
  const due = dated(date("2026-11-30"), true);
  const committed = dated(date("2026-11-26"), true, "member");
  assert.equal(
    taskSchedule({ suggested: suggestion, committed, hardDeadline: due }),
    committed.value,
  );
  assert.equal(taskDeadline({ committed, hardDeadline: due }), "2026-11-30");
  assert.equal(
    taskSchedule({ suggested: suggestion, committed: suggestion, hardDeadline: null }),
    undefined,
  );
  assert.equal(taskDeadline({ hardDeadline: suggestion, committed: null }), undefined);
  assert.equal(taskDate(new Date(2026, 10, 26, 12)), "2026-11-26");
});

test("moving away from a selected dated task clears it but opens its date when linked", () => {
  let clears = 0;
  day = undefined;
  const tree = TaskWeekSchedule({
    items: [
      {
        id: "draft",
        title: "Draft",
        when: date("2026-11-26"),
        selected: true,
        onSelect() {},
      },
    ],
    onClearSelection: () => {
      clears++;
    },
  });
  const nodes = walk(tree);
  assert.equal(nodes.find((node) => node.type === "time").props.dateTime, "2026-11-26");
  nodes
    .find((node) => node.props["aria-label"] === "11月26日 星期四 · 1 项")
    .props.onClick();
  assert.equal(clears, 0);
  nodes.find((node) => node.props["aria-label"] === "下一周").props.onClick();
  assert.equal(clears, 1);
  assert.equal(day, "2026-12-03");
});
