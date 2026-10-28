import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildLocalDshRuntime } from "../../../integrations/deepseek-harness/desktop/build.mjs";

const require = createRequire(import.meta.url);
const { outputFiles } = buildLocalDshRuntime(fileURLToPath(new URL("../", import.meta.url)));
const module = { exports: {} };
vm.runInNewContext(outputFiles[0].text, { module, exports: module.exports, require, process, Buffer, URL, setTimeout, clearTimeout });
const { readyUrl, runtimeEnvironment, inspectInstallation, supportedDshVersion, LocalDshRuntime, dshBrowserCompatibility } = module.exports;

test("only accepts the CLI's authenticated loopback ready line", () => {
  assert.equal(readyUrl("dsh web: http://127.0.0.1:1234/?token=synthetic-token"), "http://127.0.0.1:1234/?token=synthetic-token");
  for (const value of [
    "http://127.0.0.1:1234/?token=x", "dsh web: https://example.com/?token=x",
    "dsh web: http://localhost:1234/?token=x", "dsh web: http://127.0.0.1:1234/",
    "dsh web: http://127.0.0.1:0/?token=x", "dsh web: http://127.0.0.1:99999/?token=x",
    "dsh web: http://127.0.0.1:1234/?token=x&next=evil", "dsh web: http://127.0.0.1:1234/?token=" + "a".repeat(2000),
  ]) assert.equal(readyUrl(value), undefined);
});

test("child environment does not inherit model keys, Node injection or DSH overrides", () => {
  const env = runtimeEnvironment("test-home", { Path: "bin", SystemRoot: "windows", OPENAI_API_KEY: "synthetic", DEEPSEEK_API_KEY: "synthetic", NODE_OPTIONS: "--inspect", DSH_HOME: "wrong", DSH_WEB_TOKEN: "wrong" });
  assert.equal(env.Path, "bin");
  assert.equal(env.DSH_HOME, "test-home");
  assert.equal(env.ELECTRON_RUN_AS_NODE, "1");
  for (const key of ["OPENAI_API_KEY", "DEEPSEEK_API_KEY", "NODE_OPTIONS", "DSH_WEB_TOKEN"]) assert.equal(env[key], undefined);
});

test("pins installed product identity, runtime version and CLI existence", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acceptcat-dsh-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true }));
  const archive = path.join(dir, "resources", "app.asar");
  const entry = path.join(archive, "dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js");
  fs.mkdirSync(path.dirname(entry), { recursive: true });
  fs.writeFileSync(entry, "synthetic");
  fs.writeFileSync(path.join(dir, "DeepSeek Harness.exe"), "synthetic, never executed");
  const put = (name, version) => fs.writeFileSync(path.join(archive, "package.json"), JSON.stringify({ name, version }));
  put("@deepseek-ai/dsh-desktop", supportedDshVersion);
  assert.equal((await inspectInstallation(dir)).version, supportedDshVersion);
  put("wrong", supportedDshVersion);
  await assert.rejects(inspectInstallation(dir), /Windows/);
  put("@deepseek-ai/dsh-desktop", "99.0.0");
  await assert.rejects(inspectInstallation(dir), /Windows/);
  put("@deepseek-ai/dsh-desktop", supportedDshVersion);
  fs.unlinkSync(entry);
  await assert.rejects(inspectInstallation(dir));
});

test("failed installation is retryable and never reports a running service", async () => {
  const runtime = new LocalDshRuntime("missing-installation", "unused-home");
  await assert.rejects(runtime.start());
  assert.equal(runtime.state.phase, "error");
  runtime.configure("another-missing-installation");
  assert.equal(runtime.state.phase, "stopped");
  await assert.rejects(runtime.start());
  await runtime.stop();
  assert.equal(runtime.state.phase, "stopped");
});

test("compatibility layer preserves promise resolution and abort reasons without Node exposure", async () => {
  class Signal extends EventTarget { aborted = false; reason; }
  class Controller {
    signal = new Signal();
    abort(reason) { if (!this.signal.aborted) { this.signal.aborted = true; this.signal.reason = reason; this.signal.dispatchEvent(new Event("abort")); } }
  }
  const context = vm.createContext({ AbortSignal: Signal, AbortController: Controller });
  vm.runInContext("Promise.withResolvers = undefined", context);
  vm.runInContext(dshBrowserCompatibility, context);
  assert.equal(await vm.runInContext("(() => { const d = Promise.withResolvers(); d.resolve(42); return d.promise; })()", context), 42);
  const a = new Controller(), b = new Controller();
  const combined = Signal.any([a.signal, b.signal]);
  b.abort("second"); a.abort("first");
  assert.equal(combined.reason, "second");
  assert.equal(Signal.any([a.signal]).reason, "first");
  assert.equal(Signal.any([]).aborted, false);
  assert.throws(() => Signal.any([{}]), /AbortSignal/);
  assert.equal(vm.runInContext("typeof require + ':' + typeof process", context), "undefined:undefined");
});
