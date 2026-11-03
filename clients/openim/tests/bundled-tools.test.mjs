import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (file) => readFile(new URL(file, import.meta.url), "utf8");

test("bundled tools are pinned by version and hash", async () => {
  const tools = await read("../../../scripts/desktop-tools.mjs");
  // Both entries must carry a full SHA256 so a tampered download stops the build.
  const pins = tools.match(/sha256: '[a-f0-9]{64}'/g) ?? [];
  assert.equal(pins.length, 2);
  assert.match(tools, /name: 'tectonic'/);
  assert.match(tools, /name: 'dsh-research-workbench'/);
  assert.match(tools, /校验失败/);
  // A verified file is reused, so repeat builds stay offline.
  assert.match(tools, /if \(existsSync\(file\)\)/);
});

test("the installer ships tools next to the DSH runtime", async () => {
  const config = await read("../electron-builder.json5");
  assert.match(config, /\{ from: "\.\.\/tools", to: "tools"/);
});

test("tectonic is on PATH for the DSH child process", async () => {
  const runtime = await read(
    "../../../integrations/deepseek-harness/desktop/local-runtime.ts",
  );
  assert.match(runtime, /toolsDir\?: string/);
  assert.match(runtime, /path\.join\(toolsDir, "tectonic"\)/);
  assert.match(runtime, /path\.resolve\(this\.state\.directory, "\.\.", "tools"\)/);
});

test("the research plugin installs through the DSH pnpm, not by editing the profile", async () => {
  const plugin = await read("../electron/utils/dshPlugin.ts");
  assert.match(plugin, /dependencies", "pnpm", "bin", "pnpm\.mjs"/);
  assert.match(plugin, /ELECTRON_RUN_AS_NODE: "1"/);
  assert.match(plugin, /\["add", `file:\$\{input\.tarball\}`/);
  // Only the bundle list is written by hand; pnpm owns the manifest and lockfile.
  assert.match(plugin, /bundles: \[\.\.\.bundles, researchPlugin\.name\]/);
  // A profile DSH has not created yet is left alone rather than guessed at.
  assert.match(plugin, /profile 尚未创建/);
});
