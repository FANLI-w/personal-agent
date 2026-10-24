import { test } from "node:test";
import assert from "node:assert/strict";
import { dependencyLayers } from "../src/research/dependency-graph.ts";

const node = (id, dependencies = []) => ({ id, title: id, dependencies });
const ids = (result) => result.layers.map((layer) => layer.map((item) => item.id));

test("joins wait for all predecessors and preserve parallel branches without mutating the plan", () => {
  const items = [
    node("join", ["a", "b"]),
    node("b", ["root"]),
    node("root"),
    node("a", ["root"]),
  ];
  const original = structuredClone(items);
  const result = dependencyLayers(items);
  assert.equal(result.error, undefined);
  assert.deepEqual(ids(result), [["root"], ["b", "a"], ["join"]]);
  assert.deepEqual(items, original);
});

test("cycles, self references and missing predecessors produce a recoverable explanation", () => {
  for (const items of [
    [node("a", ["b"]), node("b", ["a"])],
    [node("a", ["a"])],
    [node("a", ["missing"])],
  ]) {
    const result = dependencyLayers(items);
    assert.equal(typeof result.error, "string");
    assert.deepEqual(result.layers, []);
  }
});

test("IDs that are object prototype keys remain ordinary task IDs", () => {
  assert.deepEqual(
    ids(dependencyLayers([node("__proto__"), node("constructor", ["__proto__"])])),
    [["__proto__"], ["constructor"]],
  );
});

test("duplicate step IDs are rejected and repeated dependency references do not block valid tasks", () => {
  assert(dependencyLayers([node("a"), node("a")]).error);
  assert.deepEqual(ids(dependencyLayers([node("a"), node("b", ["a", "a"])])), [
    ["a"],
    ["b"],
  ]);
});

test("the full 100-step contract limit is processed without recursive rendering", () => {
  const items = Array.from({ length: 100 }, (_, i) =>
    node(`step_${i}`, i ? [`step_${i - 1}`] : []),
  );
  const result = dependencyLayers(items.reverse());
  assert.equal(result.error, undefined);
  assert.equal(result.layers.length, 100);
  assert.equal(result.layers[99][0].id, "step_99");
  assert.deepEqual(dependencyLayers([]).layers, []);
});
