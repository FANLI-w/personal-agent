import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

// Run the real component while controlling the order of React commits and
// animation frames. A history promise can settle before its new rows commit.
async function fixture() {
  const state = [], refs = [], effects = [], layouts = [], dependencies = [];
  let cursor = 0;
  const frames = new Map(), calls = [];
  let nextFrame = 0, ready;
  const timeline = { hidden: [], jump: undefined };
  const actor = { generation: 1, actor: { member: { id: "A" } } };
  const user = { selfInfo: { userID: "im-A" } };
  const store = value => Object.assign(selector => selector(value), { getState: () => value });
  const timelineStore = store(timeline);
  timelineStore.setState = patch => Object.assign(timeline, patch);
  const row = i => ({ clientMsgID: `m${i}`, sendTime: i, contentType: 101 });
  const f = {
    timeline, actor, calls,
    history: { conversationID: "synthetic-group", loadState: {
      initLoading: false, hasMoreOld: true, firstItemIndex: 9980,
      messageList: Array.from({ length: 20 }, (_, i) => row(i + 41)),
    }, moreOldLoading: false, historyError: "", historySource: "",
    dismissHistoryError() {}, getMoreOldMessages: async () => {},
    seekMessage: () => new Promise(resolve => { ready = resolve; }) },
    resolve: () => ready(row(5)),
    commitRows: () => { f.history.loadState = {
      ...f.history.loadState, firstItemIndex: 9940,
      messageList: Array.from({ length: 60 }, (_, i) => row(i + 1)),
    }; },
    frame() { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); },
  };
  const schedule = (queue, callback, deps) => {
    const index = cursor++;
    const old = dependencies[index];
    if (!old || !deps || deps.some((value, i) => value !== old[i])) queue.push(callback);
    dependencies[index] = deps;
  };
  const react = {
    memo: component => component,
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], update => { state[index] = typeof update === "function" ? update(state[index]) : update; }];
    },
    useRef(value) { const index = cursor++; return refs[index] ||= { current: value }; },
    useEffect: (callback, deps) => schedule(effects, callback, deps),
    useLayoutEffect: (callback, deps) => schedule(layouts, callback, deps),
    useMemo(callback) { cursor++; return callback(); },
    useCallback(callback) { cursor++; return callback; },
  };
  const jsx = (type, props) => {
    if (type === "Virtuoso" && props.ref) props.ref.current = { scrollToIndex: value => calls.push(value) };
    return { type, props };
  };
  const imports = {
    react, "react/jsx-runtime": { jsx, jsxs: jsx },
    antd: { Alert: "Alert", Button: "Button", Layout: { Content: "Content" }, Spin: "Spin" },
    clsx: { default: () => "" }, "react-virtuoso": { Virtuoso: "Virtuoso" },
    "@/research/chat-timeline": {
      useChatTimeline: timelineStore, openTimeline() {}, timelineScope: (generation, id) => `${generation}:${id}`,
      chatPosition: () => ({ atBottom: true, hidden: [] }), saveChatPosition() {}, positionKey: () => "synthetic",
    },
    "@/store": { useUserStore: store(user), useConversationStore: store({ currentConversation: { conversationID: "synthetic-group" } }) },
    "@/research/store": { useResearchStore: store(actor) },
    "@/research/agent-progress": { AgentReplyProgress: "Progress", AgentProgressHistory: { Provider: "Provider" } },
    "@research-agent-platform/contracts": { OpenImResearchPointer: { safeParse: () => ({ success: false }) } },
    "@/constants/im": { SystemMessageTypes: [] }, "@/utils/events": { default: { on() {}, off() {} } },
    "@/utils/imCommon": { formatMessageTime: () => "" }, "./MessageItem": { default: "Message" },
    "./NotificationMessage": { default: "Notification" }, "./history-notice": { historyNotice: () => "" },
    "./chat-history-cache": { historyCacheFailure: () => "", subscribeHistoryCache() {} },
    "./useHistoryMessageList": { useHistoryMessageList: () => f.history },
  };
  const source = await readFile(new URL("../src/pages/chat/queryChat/ChatContent.tsx", import.meta.url), "utf8");
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, {
    module, exports: module.exports,
    require: name => { assert(Object.hasOwn(imports, name), name); return imports[name]; },
    navigator: { onLine: true }, window: { addEventListener() {}, removeEventListener() {} },
    requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: id => frames.delete(id),
  });
  f.render = () => {
    cursor = 0;
    module.exports.default();
    layouts.splice(0).forEach(callback => callback());
    effects.splice(0).forEach(callback => callback());
  };
  f.render(); f.render(); f.render();
  f.frame(); calls.length = 0;
  return f;
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test("a cross-page jump waits for target rows to commit before scrolling", async () => {
  const f = await fixture();
  f.timeline.jump = { clientMsgID: "m5" }; f.render();
  f.resolve(); await settle();
  f.frame(); // Browser frame before React has committed the history page.
  assert.equal(f.calls.length, 0);
  f.commitRows(); f.render(); f.frame();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].index, 4);
  assert.equal(f.calls[0].align, "center");
});

test("switching account before the navigation frame cannot scroll the new timeline", async () => {
  const f = await fixture();
  f.timeline.jump = { clientMsgID: "m5" }; f.render();
  f.resolve(); await settle();
  f.commitRows(); f.render();
  f.actor.generation++; f.render();
  f.frame();
  assert.equal(f.calls.length, 0);
});
