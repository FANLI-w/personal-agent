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
