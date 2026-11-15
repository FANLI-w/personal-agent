import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const source = await readFile(new URL("../src/research/memory-presentation.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const module = { exports: {} };
vm.runInNewContext(code, { module, exports: module.exports, require });
const { generalHabits, MemoryText, memoryOrigins, memoryPreferenceLines } = module.exports;

test("assistant profile includes arbitrary confirmed general topics without promoting candidates or topic-only records", () => {
  const items = [
    { id: "custom", topic: "不在旧白名单里的科研讨论节奏", content: "合成偏好", scope: "general", status: "confirmed" },
    { id: "candidate", scope: "general", status: "candidate" },
    { id: "removed", scope: "general", status: "revoked" },
    { id: "topic", scope: "topic", status: "confirmed" },
  ];
  const before = JSON.stringify(items);
  assert.deepEqual(Array.from(generalHabits(items), item => item.id), ["custom"]);
  assert.equal(JSON.stringify(items), before, "presentation must not change source records");
});

test("compact long text retains its exact complete content, including final paragraphs", () => {
  const text = "科研讨论时先说明已知情况。\n" + "保留完整合成要求及标点。".repeat(20) + "\n最后一条也要完整保留。";
  const markup = renderToStaticMarkup(React.createElement(MemoryText, { text }));
  const lines = Array.from(memoryPreferenceLines(text));
  assert.equal(lines.join(""), text, "display boundaries preserve every stored character");
  for (const line of lines) assert.ok(markup.includes(line));
  assert.match(markup, /<ul class="habit-preferences">/);
  assert.equal((markup.match(/<li(?! hidden)/g) || []).length, 3);
  assert.ok(markup.includes('<li hidden="">最后一条也要完整保留。</li>'));
  assert.match(markup, /展开全文/);
  assert.match(markup, /aria-expanded="false"/);
  assert.equal(text.split("\n").at(-1), "最后一条也要完整保留。");
});

test("short memory has no unnecessary disclosure and source labels distinguish feedback from candidates", () => {
  const markup = renderToStaticMarkup(React.createElement(MemoryText, { text: "先给结论。" }));
  assert.match(markup, /先给结论。/);
  assert.doesNotMatch(markup, /展开全文/);
  assert.match(memoryOrigins.feedback, /聊天或任务反馈/);
  assert.match(memoryOrigins.inferred, /候选/);
});


test("independent preferences display as separate lines without changing source text", () => {
  const text = "先给结论；保留依据。\n无法确认时说明。";
  const before = text;
  const lines = Array.from(memoryPreferenceLines(text));
  assert.deepEqual(lines, ["先给结论；", "保留依据。\n", "无法确认时说明。"]);
  const markup = renderToStaticMarkup(React.createElement(MemoryText, { text }));
  assert.equal((markup.match(/<li/g) || []).length, 3);
  assert.doesNotMatch(markup, /hidden|展开全文/);
  assert.equal(text, before);
});
