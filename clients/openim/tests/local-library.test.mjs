import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const realRequire = createRequire(import.meta.url);

async function load(file) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        // Default imports of node builtins need the interop helper in this realm.
        esModuleInterop: true,
      },
    }).outputText,
    {
      module,
      exports: module.exports,
      // The module only touches node builtins, so the real resolver is enough.
      require: (name) => realRequire(name),
    },
    { filename: file },
  );
  return module.exports;
}

const { insideRoot, resolveInRoot, libraryFileName, scanLibrary } = await load(
  "../electron/utils/localLibrary.ts",
);

test("a relative path can never escape the registered folder", () => {
  const root = path.resolve("/data/lab");
  assert.equal(insideRoot(root, path.join(root, "模板/母版.pptx")), true);
  assert.equal(insideRoot(root, path.resolve("/data/other/x.pptx")), false);
  assert.equal(insideRoot(root, root), false);
  assert.equal(resolveInRoot(root, "模板/母版.pptx"), path.join(root, "模板/母版.pptx"));
  assert.throws(() => resolveInRoot(root, "../secret.pptx"), /不在登记/);
});

test("only the file name is shown, never the absolute path", () => {
  assert.equal(libraryFileName("模板/组会母版.pptx"), "组会母版.pptx");
  assert.equal(libraryFileName("组会母版.pptx"), "组会母版.pptx");
});

test("scanning lists documents and images, skips noise and stays relative", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "local-library-"));
  try {
    await writeFile(path.join(root, "组会母版.pptx"), "x");
    await writeFile(path.join(root, "notes.md"), "y");
    await writeFile(path.join(root, "tool.exe"), "z");
    await mkdir(path.join(root, "图"));
    await writeFile(path.join(root, "图", "技术路线.png"), "w");
    await mkdir(path.join(root, ".git"));
    await writeFile(path.join(root, ".git", "config.md"), "hidden");
    const manifest = await scanLibrary(root);
    const rels = manifest.files.map((file) => file.rel).sort();
    assert.deepEqual(JSON.parse(JSON.stringify(rels)), [
      "notes.md",
      path.join("图", "技术路线.png"),
      "组会母版.pptx",
    ]);
    assert.equal(manifest.truncated, false);
    assert.equal(manifest.name, path.basename(root));
    // Every entry is relative, so a template stays portable between machines.
    for (const file of manifest.files) assert.equal(path.isAbsolute(file.rel), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
