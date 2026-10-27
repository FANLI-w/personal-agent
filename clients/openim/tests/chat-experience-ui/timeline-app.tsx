import React, { useState } from "react";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import ChatContent from "@/pages/chat/queryChat/ChatContent";
import ChatFooter from "@/pages/chat/queryChat/ChatFooter";
import ChatDetailsDrawer from "@/pages/chat/queryChat/ChatHeader/ChatDetailsDrawer";
import HistorySearch from "@/pages/chat/queryChat/ChatHeader/HistorySearch";
import { ChatMessageActions } from "@/research/ChatMessageActions";
import { GroupChatRoster } from "@/research/GroupChatRoster";
import { useChatTimeline, locateMessage } from "@/research/chat-timeline";
import emitter from "@/utils/events";
import { useConversationStore } from "./mock-state";
import { nativeMessages, sdkCalls, sdkBehavior, seedTimeline } from "./timeline-data";
import { messages } from "./mock-api";
function initialize() {
  seedTimeline();
  const fact = (id: string, sequence: number, origin: string, text: string) => ({
    id,
    conversationId: "group",
    sequence,
    origin,
    text,
    senderContactId: origin === "human" ? "human_me" : "agent_peer",
    mentions: [],
    resources: [],
    actionIds: [],
    turnId: null,
    createdAt: new Date().toISOString(),
  });
  messages.push(
    fact("input", 1, "human", "请比较两种实验方法"),
    fact(
      "answer",
      2,
      "model",
      '## 方法比较\n| 方法 | 条件 |\n| --- | --- |\n| A | 固定样本 |\n| B | 分组对照 |\n\n```python\nprint("synthetic")\n```\n建议补充独立重复实验。',
    ),
  );
  for (const [index, m] of messages.entries())
    nativeMessages.push({
      clientMsgID: "canonical_" + m.id,
      sendID: index ? "im_agent_peer" : "im_me",
      senderNickname: index ? "文献助手" : "测试老师",
      groupID: "test_group",
      contentType: 110,
      status: 2,
      sendTime: Date.now() + index,
      seq: 66 + index,
      customElem: {
        data: JSON.stringify({
          type: "research_message",
          bridgeVersion: "1.0.0",
          conversationId: "group",
          messageId: m.id,
          sequence: m.sequence,
        }),
      },
    });
  Object.assign(window.fixture, {
    nativeMessages,
    sdkCalls,
    sdkBehavior,
    useChatTimeline,
    locateMessage,
    emitter,
  });
}
function Screen() {
  const [search, setSearch] = useState(false);
  const [details, setDetails] = useState(false);
  const nav = useNavigate();
  const current = useConversationStore((s) => s.currentConversation);
  return (
    <GroupChatRoster imID={current.conversationID}>
      <div className="fixture-banner">
        合成测试环境 · 生产消息区、搜索、转发、撤回组件 · 不连接真实账号
      </div>
      <main
        className="personal-agent-desktop"
        style={{ height: 790, display: "flex", flexDirection: "column" }}
      >
        <header>
          <strong>{current.showName}</strong>
          <button onClick={() => setSearch(true)}>搜索聊天</button>
          <button onClick={() => setDetails(true)}>聊天详情</button>
          <button
            onClick={() => {
              const next = useConversationStore
                .getState()
                .conversationList.find(
                  (c) => c.conversationID !== current.conversationID,
                )!;
              useConversationStore.setState({ currentConversation: next });
              nav("/chat/" + next.conversationID);
            }}
          >
            切换会话
          </button>
        </header>
        <ChatMessageActions />
        <div id="chat-container" className="desktop-chat-stage">
          <div className="desktop-chat-history">
            <ChatContent key={current.conversationID} />
          </div>
        </div>
        <div style={{ height: 210, flexShrink: 0 }}>
          <ChatFooter />
        </div>
        <ChatDetailsDrawer
          open={details}
          onClose={() => setDetails(false)}
          onSearch={() => {
            setDetails(false);
            setSearch(true);
          }}
          onManage={() => {
            sdkCalls.push({ name: "manage" });
            setDetails(false);
          }}
          onAboutMe={() => {}}
        />
        <HistorySearch open={search} onClose={() => setSearch(false)} />
      </main>
    </GroupChatRoster>
  );
}
export default function TimelineApp() {
  useState(() => initialize());
  return (
    <MemoryRouter initialEntries={["/chat/fixture_group"]}>
      <Routes>
        <Route path="/chat/:conversationID" element={<Screen />} />
      </Routes>
    </MemoryRouter>
  );
}
