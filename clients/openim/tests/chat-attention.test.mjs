import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function load(file, imports, globals = {}) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module, exports: module.exports, console, Buffer, URL,
    require: name => {
      if (!(name in imports)) throw Error("Unexpected import: " + name);
      return imports[name];
    }, ...globals,
  }, { filename: file });
  return module.exports;
}

async function conversations() {
  const research = { generation: 1 };
  const user = { selfInfo: { userID: "self-a" } };
  const sdk = { getTotalUnreadMsgCount: async () => ({ data: 4 }) };
  const create = () => initializer => {
    let state;
    const get = () => state;
    const set = value => { state = { ...state, ...(typeof value === "function" ? value(state) : value) }; };
    state = initializer(set, get);
    const store = selector => selector(state);
    store.getState = get;
    return store;
  };
  const exports = await load("../src/store/conversation.ts", {
    zustand: { create }, i18next: { t: value => value },
    "@/layout/MainContentWrap": { IMSDK: sdk },
    "@/utils/common": { feedbackToast() {} },
    "@/utils/imCommon": { conversationSort: value => value, isGroupSession: () => false },
    "./user": { useUserStore: { getState: () => user } },
    "@/research/store": { useResearchStore: { getState: () => research } },
  });
  return { state: () => exports.useConversationStore.getState(), research, user, sdk };
}

test("leaving a chat clears its live selection while preserving the last conversation; logout clears both", async () => {
  const f = await conversations();
  await f.state().updateCurrentConversation({ conversationID: "chat-colleague", conversationType: 1 });
  await f.state().updateCurrentConversation();
  assert.equal(f.state().currentConversation, undefined);
  assert.equal(f.state().lastConversationID, "chat-colleague");
  // Pin/list synchronization must not choose a different chat.
  f.state().updateConversationList([{ conversationID: "chat-assistant", isPinned: true }], "push");
  assert.equal(f.state().lastConversationID, "chat-colleague");
  await f.state().updateCurrentConversation({ conversationID: "chat-other", conversationType: 1 }, false, () => false);
  assert.equal(f.state().lastConversationID, "chat-colleague");
  f.state().clearConversationStore();
  assert.equal(f.state().lastConversationID, undefined);
});

test("a delayed unread snapshot cannot erase a newer SDK event or leak across logins", async () => {
  const f = await conversations();
  let resolve;
  f.sdk.getTotalUnreadMsgCount = () => new Promise(r => { resolve = r; });
  const request = f.state().getUnReadCountByReq();
  f.state().updateUnReadCount(7);
  resolve({ data: 2 });
  await request;
  assert.equal(f.state().unReadCount, 7);
  const oldLogin = f.state().getUnReadCountByReq();
  f.research.generation++;
  f.user.selfInfo.userID = "self-b";
  f.state().clearConversationStore();
  resolve({ data: 11 });
  await oldLogin;
  assert.equal(f.state().unReadCount, 0);
  for (const invalid of [-1, 1.2, NaN, Infinity, "9"])
    f.state().updateUnReadCount(invalid);
  assert.equal(f.state().unReadCount, 0);
});

async function readState() {
  const conversation = { conversationID: "chat-colleague", unreadCount: 3 };
  const reads = [], effects = [], refs = [], timers = [];
  const listeners = new Map();
  let focused = false;
  const document = {
    visibilityState: "visible", hasFocus: () => focused,
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name),
  };
  const window = {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name),
  };
  const current = { generation: 1 };
  const user = { isLogining: false, connectState: "success", syncState: "success", selfInfo: { userID: "self-a" } };
  const userStore = selector => selector(user);
  userStore.getState = () => user;
  const hooks = await load("../src/pages/chat/queryChat/useConversationState.ts", {
    ahooks: { useLatest: value => { const ref = { current: value }; refs.push(ref); return ref; }, useUpdateEffect() {} },
    react: { useCallback: fn => fn, useEffect: fn => effects.push(fn), useRef: value => ({ current: value }) },
    "react-router-dom": { useParams: () => ({ conversationID: "chat-colleague" }) },
    "@/layout/MainContentWrap": { IMSDK: { markConversationMessageAsRead: async id => reads.push(id) } },
    "@/research/store": { useResearchStore: { getState: () => current } },
    "@/store": { useUserStore: userStore, useConversationStore: selector => selector({ currentConversation: conversation }) },
    "@/utils/common": { feedbackToast() {} },
  }, { document, window, setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {} });
  hooks.default();
  const cleanup = effects.map(fn => fn()).filter(Boolean);
  return { reads, refs, document, listeners, focus: value => { focused = value; }, cleanup: () => cleanup.forEach(fn => fn()) };
}

test("background/minimized chats stay unread; focusing the visible current chat marks it read", async () => {
  const f = await readState();
  assert.deepEqual(f.reads, []);
  f.focus(true);
  f.document.visibilityState = "hidden";
  f.listeners.get("focus")();
  assert.deepEqual(f.reads, []);
  f.document.visibilityState = "visible";
  f.listeners.get("visibilitychange")();
  assert.deepEqual(f.reads, ["chat-colleague"]);
  f.refs[0].current = "chat-other";
  f.listeners.get("focus")();
  assert.equal(f.reads.length, 1);
  f.cleanup();
  assert.equal(f.listeners.size, 0);
});

async function notification() {
  let handler, focused = false, visible = true;
  const calls = [];
  const frame = { url: "http://127.0.0.1:4567/#/chat/chat-colleague" };
  const contents = { mainFrame: frame };
  const status = { connected: true, rendererOrigin: "http://127.0.0.1:4567" };
  const window = {
    isDestroyed: () => false, isFocused: () => focused, isVisible: () => visible,
    setOverlayIcon: (icon, text) => calls.push(["overlay", Boolean(icon), text]),
    flashFrame: enabled => calls.push(["flash", enabled]),
  };
  const code = await load("../electron/main/messageNotificationManage.ts", {
    electron: {
      app: { setBadgeCount: count => calls.push(["badge", count]) },
      BrowserWindow: { fromWebContents: value => { assert.equal(value, contents); return window; } },
      ipcMain: { handle: (channel, fn) => { assert.equal(channel, "set-message-unread-count"); handler = fn; } },
      nativeImage: { createFromBitmap: (bytes, size) => {
        assert.equal(bytes.length, 16 * 16 * 4);
        assert.equal(size.width, 16);
        assert.equal(bytes[(8 * 16 + 8) * 4 + 3], 255);
        return { image: true };
      } },
    },
    "./windowManage": { getWebContents: () => contents, getResearchServiceStatus: () => status },
  }, { process: { platform: "win32" } });
  code.registerMessageNotificationBridge();
  const event = { sender: contents, senderFrame: frame };
  return { calls, event, status, run: (count, from = event) => handler(from, count),
    focus: value => { focused = value; }, visible: value => { visible = value; } };
}

test("Windows gets an unread overlay and flashes only on increased unread while backgrounded", async () => {
  const f = await notification();
  f.run(2);
  assert.deepEqual(f.calls, [["overlay", true, "2 条未读消息"], ["flash", true]]);
  f.calls.length = 0;
  f.run(2);
  assert.deepEqual(f.calls, [["overlay", true, "2 条未读消息"]]);
  f.calls.length = 0;
  f.focus(true);
  f.run(3);
  assert.deepEqual(f.calls, [["overlay", true, "3 条未读消息"]]);
  f.calls.length = 0;
  f.run(0);
  assert.deepEqual(f.calls, [["overlay", false, ""], ["flash", false]]);
  f.calls.length = 0;
  f.visible(false);
  f.run(1);
  assert.deepEqual(f.calls, [["overlay", true, "1 条未读消息"], ["flash", true]]);
});

test("notification IPC rejects foreign frames, other pages, disconnected state and invalid counts", async () => {
  const f = await notification();
  for (const invalid of [-1, 0.2, NaN, Infinity, "7", null])
    assert.throws(() => f.run(invalid), /无效/);
  assert.throws(() => f.run(1, { ...f.event, sender: {} }), /当前聊天页面/);
  assert.throws(() => f.run(1, { ...f.event, senderFrame: { url: f.event.senderFrame.url } }), /当前聊天页面/);
  f.event.senderFrame.url = "https://example.invalid/";
  assert.throws(() => f.run(1), /当前聊天页面/);
  f.event.senderFrame.url = "http://127.0.0.1:4567/#/chat/a";
  f.status.connected = false;
  assert.throws(() => f.run(1), /当前聊天页面/);
  assert.deepEqual(f.calls, []);
});

test("SDK unread changes reach the desktop bridge, global mute suppresses it and logout/unmount clears it", async () => {
  const calls = [], effects = [];
  const store = initial => {
    let state = initial;
    const listeners = new Set();
    return {
      getState: () => state,
      subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
      set: next => { const old = state; state = next; listeners.forEach(fn => fn(next, old)); },
      listeners,
    };
  };
  const conversations = store({ unReadCount: 0 });
  const users = store({ selfInfo: { globalRecvMsgOpt: 0 } });
  const code = await load("../src/research/useMessageNotifications.ts", {
    "@openim/wasm-client-sdk": { MessageReceiveOption: { ReceiveWithoutNotification: 2 } },
    react: { useEffect: fn => effects.push(fn) },
    "@/store": { useConversationStore: conversations, useUserStore: users },
  }, { window: { electronAPI: { setMessageUnreadCount: async count => calls.push(count) } } });
  code.useMessageNotifications();
  const cleanup = effects[0]();
  conversations.set({ unReadCount: 2 });
  conversations.set({ unReadCount: 2 });
  users.set({ selfInfo: { globalRecvMsgOpt: 2 } });
  conversations.set({ unReadCount: 5 });
  users.set({ selfInfo: { globalRecvMsgOpt: 0 } });
  conversations.set({ unReadCount: 0 });
  assert.deepEqual(calls, [0, 2, 0, 0, 5, 0]);
  cleanup();
  conversations.set({ unReadCount: 4 });
  assert.deepEqual(calls, [0, 2, 0, 0, 5, 0, 0]);
  assert.equal(conversations.listeners.size + users.listeners.size, 0);
});
