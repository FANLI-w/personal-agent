import { Popover } from "antd";
import ConversationItem from "@/pages/chat/ConversationSider/ConversationItem";
import { MentionList } from "@/research/MentionList";
import { feedbackToast } from "@/utils/common";

// 开发预览：渲染生产代码里真实的 ConversationItem / MentionList 组件，仅数据为假。
// 入口 /dev-preview，仅在开发阶段使用，不进入生产流程。
const previewConversations = [
  { conversationID: "si_1", showName: "张小明", unreadCount: 3, isPinned: true, latestMsgSendTime: Date.now() - 3600000, conversationType: 1, groupID: "", faceURL: "" },
  { conversationID: "g_1", showName: "科研小组", groupID: "g1", unreadCount: 0, isPinned: false, latestMsgSendTime: Date.now() - 7200000, conversationType: 2, faceURL: "" },
  { conversationID: "si_2", showName: "欧阳娜娜", unreadCount: 0, isPinned: false, latestMsgSendTime: Date.now() - 86400000, conversationType: 1, groupID: "", faceURL: "" },
  { conversationID: "si_3", showName: "吴凡", unreadCount: 0, isPinned: false, latestMsgSendTime: Date.now() - 172800000, conversationType: 1, groupID: "", faceURL: "" },
];

const previewMentionContacts = [
  { id: "m1", displayName: "张小明", agent: false, external: false },
  { id: "m2", displayName: "科研助手", agent: true, external: false },
  { id: "m3", displayName: "李四", agent: false, external: false },
  { id: "m4", displayName: "文献综述专家", agent: true, external: false },
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

    <h2 style={{ fontSize: 14, marginTop: 24, marginBottom: 8 }}>
      @ 提及弹窗预览（点按钮看弹窗）
    </h2>
    <div
      style={{
        background: "#fff",
        borderRadius: 8,
        padding: 16,
        maxWidth: 320,
        minHeight: 80,
      }}
    >
      <Popover
        content={
          <MentionList
            contacts={previewMentionContacts}
            onSelect={(name) => feedbackToast({ msg: `已选择 @${name}` })}
          />
        }
        trigger="click"
        placement="top"
        arrow={false}
      >
        <button
          type="button"
          style={{
            width: 32,
            height: 32,
            borderRadius: 4,
            fontSize: 16,
            fontWeight: 600,
            cursor: "pointer",
            background: "#f1f5f9",
            border: "none",
            color: "#334155",
          }}
          aria-label="提及成员"
        >
          @
        </button>
      </Popover>
    </div>
  </div>
);

export default DevPreview;
