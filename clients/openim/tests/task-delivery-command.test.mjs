import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("vite"))("esbuild");
const result = await esbuild.build({ entryPoints: [fileURLToPath(new URL("../src/research/task-delivery-command.ts", import.meta.url))], bundle: true, write: false, format: "esm", platform: "node" });
const { prepareTaskDelivery, deliveryReceiptLabel } = await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));
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
test("a saved submission receipt follows the actual service review status", () => {
  assert.equal(deliveryReceiptLabel("in_review"), "已提交，等待验收");
  assert.equal(deliveryReceiptLabel("awaiting_review"), "已提交，等待验收");
  assert.equal(deliveryReceiptLabel("completed"), "成果已验收");
  assert.equal(deliveryReceiptLabel("changes_requested"), "上版已退回，请修改后再提交");
  assert.equal(deliveryReceiptLabel("running"), "上次提交记录");
  assert.equal(deliveryReceiptLabel(""), "上次提交记录");
});
