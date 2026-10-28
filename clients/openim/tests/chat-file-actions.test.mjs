import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
const code = ts.transpileModule(
  await readFile(
    new URL("../electron/main/chatFileActionsManage.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  },
).outputText;
function fixture() {
  const handlers = {},
    writes = [],
    reveals = [],
    dialogs = [];
  let owner = "a",
    authorized = true,
    answer = { canceled: true },
    now = 0;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    Uint8Array,
    Error,
    Date: { now: () => now },
    require: (name) =>
      ({
        electron: {
          ipcMain: {
            handle: (name, fn) => {
              handlers[name] = fn;
            },
          },
          BrowserWindow: { fromWebContents: () => ({}) },
          dialog: {
            showSaveDialog: async (_, options) => {
              dialogs.push(options);
              return typeof answer === "function" ? answer() : answer;
            },
          },
          shell: { showItemInFolder: (path) => reveals.push(path) },
        },
        "node:fs": {
          promises: {
            writeFile: async (...args) => writes.push(args),
            access: async () => {},
          },
        },
        "node:crypto": { randomUUID: () => "token-" + writes.length },
        "./localFolderManage": {
          authority: () => {
            if (!authorized) throw new Error("forbidden");
            return { owner, contents: {} };
          },
        },
      }[name]),
  });
  module.exports.registerChatFileActionsBridge();
  return {
    handlers,
    writes,
    reveals,
    dialogs,
    setAnswer: (v) => {
      answer = v;
    },
    navigate: () => {
      owner = "b";
    },
    block: () => {
      authorized = false;
    },
    expire: () => {
      now = 1900000;
    },
  };
}
const bytes = new Uint8Array([1, 2, 3]);
test("save cancellation does not write a file or mint a reveal token", async () => {
  const f = fixture();
  assert.equal(await f.handlers["save-chat-file"]({}, "实验.txt", bytes), null);
  assert.equal(f.writes.length, 0);
  assert.equal(f.dialogs[0].defaultPath, "实验.txt");
});
test("save writes exact bytes only to the chosen path; reveal accepts its opaque token", async () => {
  const f = fixture();
  f.setAnswer({ canceled: false, filePath: "D:\\chosen\\实验.txt" });
  const result = await f.handlers["save-chat-file"]({}, "../实验.txt", bytes);
  assert.equal(f.dialogs[0].defaultPath, "实验.txt");
  assert.deepEqual(f.writes[0], ["D:\\chosen\\实验.txt", bytes]);
  await f.handlers["reveal-chat-file"]({}, result.token);
  assert.deepEqual(f.reveals, ["D:\\chosen\\实验.txt"]);
  await assert.rejects(f.handlers["reveal-chat-file"]({}, "D:\\private.txt"));
});
test("untrusted callers, invalid filenames and oversized data cannot open a dialog", async () => {
  const f = fixture();
  for (const name of ["CON.txt", "NUL", "..", ""])
    await assert.rejects(f.handlers["save-chat-file"]({}, name, bytes));
  await assert.rejects(
    f.handlers["save-chat-file"]({}, "file.txt", new Uint8Array(64 * 1024 * 1024 + 1)),
  );
  f.block();
  await assert.rejects(f.handlers["save-chat-file"]({}, "ok.txt", bytes));
  assert.equal(f.dialogs.length, 0);
});
test("changed owner while dialog is open cannot write", async () => {
  const f = fixture();
  f.setAnswer(() => {
    f.navigate();
    return { canceled: false, filePath: "D:\\chosen.txt" };
  });
  await assert.rejects(f.handlers["save-chat-file"]({}, "实验.txt", bytes));
  assert.equal(f.writes.length, 0);
});
test("expired or different-owner reveal records cannot open a folder", async () => {
  for (const change of ["expire", "navigate"]) {
    const f = fixture();
    f.setAnswer({ canceled: false, filePath: "D:\\chosen.txt" });
    const result = await f.handlers["save-chat-file"]({}, "实验.txt", bytes);
    f[change]();
    await assert.rejects(f.handlers["reveal-chat-file"]({}, result.token));
    assert.equal(f.reveals.length, 0);
  }
});
