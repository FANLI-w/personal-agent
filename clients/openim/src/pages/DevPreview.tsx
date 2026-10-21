import ConversationItem from "@/pages/chat/ConversationSider/ConversationItem";

// 开发预览：渲染生产代码里真实的 ConversationItem 组件，仅数据为假。
// 入口 /dev-preview，仅在开发阶段使用，不进入生产流程。
const previewConversations = [
  { conversationID: "si_1", showName: "张小明", unreadCount: 3, isPinned: true, latestMsgSendTime: Date.now() - 3600000, conversationType: 1, groupID: "", faceURL: "" },
  { conversationID: "g_1", showName: "科研小组", groupID: "g1", unreadCount: 0, isPinned: false, latestMsgSendTime: Date.now() - 7200000, conversationType: 2, faceURL: "" },
  { conversationID: "si_2", showName: "欧阳娜娜", unreadCount: 0, isPinned: false, latestMsgSendTime: Date.now() - 86400000, conversationType: 1, groupID: "", faceURL: "" },
  { conversationID: "si_3", showName: "吴凡", unreadCount: 0, isPinned: false, latestMsgSendTime: Date.now() - 172800000, conversationType: 1, groupID: "", faceURL: "" },
];

export const DevPreview = () => (
  <div style={{ padding: 24, background: "#f5f5f5", minHeight: "100vh" }}>
    <h1 style={{ fontSize: 16, marginBottom: 12 }}>
      开发预览 · 会话列表（真实组件 + 假数据）
    </h1>
    <div
      style={{
        background: "#fff",
        borderRadius: 8,
        overflow: "hidden",
        maxWidth: 320,
      }}
    >
      {previewConversations.map((c) => (
        <ConversationItem
          key={c.conversationID}
          isActive={false}
          conversation={c as never}
        />
      ))}
    </div>
  </div>
);

export default DevPreview;
