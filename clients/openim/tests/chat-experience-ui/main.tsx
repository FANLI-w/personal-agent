import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import i18next from "i18next";
import ChatFooter from "@/pages/chat/queryChat/ChatFooter/index";
import { AgentReplyProgress } from "@/research/agent-progress";
import { GroupMessageStatuses } from "@/research/GroupMessageStatuses";
import { GroupChatRoster } from "@/research/GroupChatRoster";
import { selectChatReply } from "@/research/chat-reply";
import { readMentionComposer } from "@/research/mention-composer";
import { calls, messages, turns } from "./mock-api";
import { useConversationStore, useResearchStore } from "./mock-state";
import "./style.css";
import "@/layout/desktop-layout.scss";
import TimelineApp from "./timeline-app";
i18next.init({
  lng: "zh-CN",
  resources: { "zh-CN": { translation: { placeholder: { send: "发送" } } } },
});
window.fixture = {
  ...(window.fixture || {}),
  calls,
  messages,
  turns,
  readMentionComposer,
  useConversationStore,
  useResearchStore,
};
if (location.search.includes("toolbar")) {
  document.body.classList.add("toolbar-fixture");
  window.fixture.stagedImages = [];
  window.fixture.captureMode = "success";
  // Only synthetic pixels: never capture the user's desktop in this fixture.
  window.electronAPI = {
    captureChatScreens: async () => {
      if (window.fixture.captureMode === "failure")
        throw new Error("合成测试：屏幕捕获失败");
      if (window.fixture.captureMode === "delayed")
        await new Promise((r) => setTimeout(r, 1500));
      const canvas = document.createElement("canvas");
      canvas.width = 800;
      canvas.height = 450;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#e6f0fc";
      context.fillRect(0, 0, 800, 450);
      context.fillStyle = "#263342";
      context.font = "28px sans-serif";
      context.fillText("合成截图 · 不含真实桌面内容", 50, 100);
      return [{ id: "synthetic", name: "合成屏幕", dataUrl: canvas.toDataURL() }];
    },
  } as any;
}
function App() {
  const actorId = useResearchStore((s) => s.actor.member.id);
  const [tick, setTick] = useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 300);
    return () => clearInterval(t);
  }, []);
  return (
    <MemoryRouter>
      <div className="fixture-banner">
        合成测试环境 · 实际生产组件 · 不连接真实账号或模型
      </div>
      <main className="personal-agent-desktop">
        <header>
          <strong>课题讨论</strong>
          <span>测试老师 · 测试同事 · 三位助手</span>
        </header>
        <section className="fixture-history">
          <div className="example-peer">
            <strong>测试同事</strong>
            <p>两位文献助手可以分别比较方法和检查证据。</p>
          </div>
          {messages.map((m) => (
            <div key={m.id} className="fixture-message">
              <p>{m.text}</p>
              <GroupMessageStatuses
                conversationId="group"
                messageId={m.id}
                inputText={m.text}
                imID="fixture_group"
                own={actorId === "me"}
              />
            </div>
          ))}
          <AgentReplyProgress />
        </section>
        <div className="fixture-actions">
          {location.search.includes("toolbar") && (
            <>
              <button
                onClick={() =>
                  useConversationStore.setState({
                    currentConversation:
                      useConversationStore.getState().conversationList[0],
                  })
                }
              >
                切换群聊
              </button>
              <button
                onClick={() =>
                  useConversationStore.setState({
                    currentConversation:
                      useConversationStore.getState().conversationList[1],
                  })
                }
              >
                切换私聊
              </button>
            <button onClick={() => useConversationStore.setState({ currentConversation: useConversationStore.getState().conversationList[2] })}>切换助手</button>
              <button
                onClick={() => {
                  window.fixture.captureMode = "failure";
                }}
              >
                模拟截图失败
              </button>
              <button
                onClick={() => {
                  window.fixture.captureMode = "delayed";
                }}
              >
                模拟延迟截图
              </button>
              <button
                onClick={() => {
                  window.fixture.captureMode = "success";
                }}
              >
                恢复截图
              </button>
            </>
          )}
          <button
            onClick={() =>
              selectChatReply(
                {
                  clientMsgID: "reply-source",
                  senderNickname: "文献助手",
                  contentType: 101,
                  textElem: { content: "这组结果还缺少对照。" },
                } as any,
                "这组结果还缺少对照。",
                "fixture_group",
                1,
                { contactId: "agent_peer", displayName: "文献助手" },
              )
            }
          >
            引用同事助手的回答
          </button>
        </div>
        <div className="fixture-footer">
          <ChatFooter />
        </div>
      </main>
    </MemoryRouter>
  );
}
createRoot(document.getElementById("root")!).render(
  location.search.includes("timeline") ? (
    <TimelineApp />
  ) : (
    <GroupChatRoster imID="fixture_group">
      <App />
    </GroupChatRoster>
  ),
);
