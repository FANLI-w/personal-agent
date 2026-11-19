import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const module = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(
    await readFile(new URL("../src/research/library-delivery-labels.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText,
  { exports: module.exports },
);
const { deliveryTaskId, authorizedDeliveryTitles } = module.exports;

test("the generated collection label is recognized only for its exact scoped task", () => {
  const generated = { name: "任务交付 · task_a", scope: "task_scoped", taskIds: ["task_a"] };
  assert.equal(deliveryTaskId(generated), "task_a");
  assert.equal(deliveryTaskId({ ...generated, taskIds: ["task_b"] }), undefined);
  assert.equal(deliveryTaskId({ ...generated, taskIds: ["task_a", "task_b"] }), undefined);
  assert.equal(deliveryTaskId({ ...generated, scope: "owner_private" }), undefined);
  assert.equal(deliveryTaskId({ ...generated, name: "My project files" }), undefined);
});

test("same-named tasks retain separate identities and inaccessible titles are never returned", () => {
  const task = (taskId, title, source = "personal_task", summaryOnly = false) =>
    ({ taskId, title, source, summaryOnly });
  const titles = authorizedDeliveryTitles([
    task("first", "Lab report"),
    task("second", "Lab report", "research_task"),
    task("invited", "Invitation only", "research_task", true),
    task("ambiguous", "Private work"),
    task("ambiguous", "Unrelated team work", "research_task", true),
    task("schedule", "Unrelated schedule", "followup"),
  ]);
  assert.equal(titles.get("first"), "Lab report");
  assert.equal(titles.get("second"), "Lab report");
  for (const id of ["invited", "ambiguous", "schedule", "revoked"]) {
    assert.equal(titles.get(id), undefined);
  }
});
