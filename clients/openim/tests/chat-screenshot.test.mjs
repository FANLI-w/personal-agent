import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const code = ts.transpileModule(
  await readFile(
    new URL("../electron/main/chatScreenshotManage.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  },
).outputText;
function fixture({ sources, focused = true, authorized = true, timeout = false } = {}) {
  let handler,
    owner = "owner",
    visible = true;
  const calls = [];
  const parent = {
    isVisible: () => visible,
    isFocused: () => focused,
    isDestroyed: () => false,
    hide: () => {
      visible = false;
      calls.push("hide");
    },
    show: () => {
      visible = true;
      calls.push("show");
    },
    focus: () => calls.push("focus"),
  };
  const electron = {
    BrowserWindow: { fromWebContents: () => parent },
    ipcMain: {
      handle: (_, value) => {
        handler = value;
      },
    },
    desktopCapturer: {
      getSources: async (options) => {
        calls.push(options);
        return sources
          ? sources()
          : [
              {
                id: "screen:1",
                thumbnail: {
                  isEmpty: () => false,
                  toDataURL: () => "data:image/png;base64,synthetic",
                },
              },
            ];
      },
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    Error,
    setTimeout: (fn, ms) => setTimeout(fn, ms === 250 ? 0 : timeout ? 5 : ms),
    clearTimeout,
    require: (name) =>
      name === "electron"
        ? electron
        : {
            authority: () => {
              if (!authorized) throw new Error("unauthorized");
              return { owner, contents: {} };
            },
          },
  });
  module.exports.registerChatScreenshotBridge();
  return {
    run: () => handler({}),
    calls,
    navigate: () => {
      owner = "new-owner";
    },
    get visible() {
      return visible;
    },
  };
}
test("one-shot screen capture hides and restores the foreground window, returning only preview pixels", async () => {
  const f = fixture();
  const result = await f.run();
  assert.equal(result[0].name, "屏幕 1");
  assert.equal(result.length, 1);
  assert.equal(f.calls[0], "hide");
  assert.equal(f.calls[1].types.join(), "screen");
  assert.deepEqual(f.calls.slice(-2), ["show", "focus"]);
  assert.equal(f.visible, true);
});
test("untrusted or background callers cannot trigger capture", async () => {
  for (const options of [{ authorized: false }, { focused: false }]) {
    const f = fixture(options);
    await assert.rejects(f.run());
    assert.equal(f.calls.length, 0);
  }
});
test("capture failure and empty screen results restore the window", async () => {
  for (const sources of [
    () => {
      throw new Error("capture failed");
    },
    () => [],
  ]) {
    const f = fixture({ sources });
    await assert.rejects(f.run());
    assert.equal(f.visible, true);
    assert.deepEqual(f.calls.slice(-2), ["show", "focus"]);
  }
});
test("navigation while capture is pending discards pixels", async () => {
  let f;
  f = fixture({
    sources: () => {
      f.navigate();
      return [];
    },
  });
  await assert.rejects(f.run(), /窗口已变化/);
  assert.equal(f.visible, true);
});
test("a stalled capture times out and restores the window", async () => {
  const f = fixture({ sources: () => new Promise(() => {}), timeout: true });
  await assert.rejects(f.run(), /截图超时/);
  assert.equal(f.visible, true);
});
test("a second capture cannot overlap the first", async () => {
  const f = fixture();
  const first = f.run();
  await assert.rejects(f.run());
  await first;
  assert.equal(f.calls.filter((value) => value === "hide").length, 1);
});
