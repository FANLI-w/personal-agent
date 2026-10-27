import {
  MessageItem as MessageItemType,
  MessageType,
  SessionType,
} from "@openim/wasm-client-sdk";
import clsx from "clsx";
import { FC, memo, useRef, useState, useEffect } from "react";
import { Checkbox, Dropdown } from "antd";
import type { ChatMessageDetails } from "@research-agent-platform/contracts";
import {
  useChatTimeline,
  registerTimelineMessage,
  timelineScope,
  researchPointer,
  selectTimelineMessage,
} from "@/research/chat-timeline";
import {
  selectChatReply,
  readableMessage,
  type ReplyAgent,
} from "@/research/chat-reply";
import { feedbackToast } from "@/utils/common";
import QuoteMessageRender from "./QuoteMessageRender";

import OIMAvatar from "@/research/ResearchAvatar";
import { formatMessageTime } from "@/utils/imCommon";

import CatchMessageRender from "./CatchMsgRenderer";
import MediaMessageRender from "./MediaMessageRender";
import styles from "./message-item.module.scss";
import MessageItemErrorBoundary from "./MessageItemErrorBoundary";
import MessageSuffix from "./MessageSuffix";
import TextMessageRender from "./TextMessageRender";
import FileMessageRender from "./FileMessageRender";
import SoundMessageRender from "./SoundMessageRender";
import ResearchMessageRender from "@/research/ResearchMessageRender";
import { useConversationStore } from "@/store";
import { useResearchStore } from "@/research/store";
import { selectedMessageText } from "@/research/chat-message-copy";
import {
  useGroupChatRoster,
  groupContactDescription,
} from "@/research/GroupChatRoster";

export interface IMessageItemProps {
  message: MessageItemType;
  isSender: boolean;
  disabled?: boolean;
  conversationID?: string;
  messageUpdateFlag?: string;
  onReadableText?: (text: string) => void;
  onReplyAgent?: (agent: ReplyAgent | undefined) => void;
  onReply?: () => void;
  onDetails?: (details: ChatMessageDetails | undefined) => void;
}

const components: Record<number, FC<IMessageItemProps>> = {
  [MessageType.TextMessage]: TextMessageRender,
  [MessageType.AtTextMessage]: TextMessageRender,
  [MessageType.PictureMessage]: MediaMessageRender,
  [MessageType.FileMessage]: FileMessageRender,
  [MessageType.VoiceMessage]: SoundMessageRender,
  [MessageType.CustomMessage]: ResearchMessageRender,
  [MessageType.QuoteMessage]: QuoteMessageRender,
};

const MessageItem: FC<IMessageItemProps> = ({
  message,
  disabled,
  isSender,
  conversationID,
}) => {
  const messageWrapRef = useRef<HTMLDivElement>(null);
  const [canonicalText, setCanonicalText] = useState("");
  const [replyAgent, setReplyAgent] = useState<ReplyAgent>();
  const [details, setDetails] = useState<ChatMessageDetails>();
  const [selectionText, setSelectionText] = useState("");
  const text = readableMessage(message) || canonicalText;
  const copyText = [
    MessageType.TextMessage,
    MessageType.AtTextMessage,
    MessageType.QuoteMessage,
    MessageType.CustomMessage,
  ].includes(message.contentType)
    ? readableMessage(message) || canonicalText
    : "";
  const generation = useResearchStore((s) => s.generation);
  const actor = useResearchStore((s) => s.actor?.member.id);
  const roster = useGroupChatRoster();
  const author = roster.data?.data.find(
    (c) => c.id === (details?.message.senderContactId || replyAgent?.contactId),
  );
  const authorName = author?.displayName || message.senderNickname;
  const authorLabel =
    author && author.identity.kind !== "human"
      ? `${authorName} · ${groupContactDescription(
          author,
          roster.data?.data || [],
          actor,
        )}`
      : authorName;
  const viewScope = timelineScope(generation, conversationID || "");
  const selecting = useChatTimeline((s) => s.scope === viewScope && s.selecting);
  const selected = useChatTimeline(
    (s) => s.scope === viewScope && s.selected.includes(message.clientMsgID),
  );
  const highlighted = useChatTimeline(
    (s) => s.scope === viewScope && s.highlighted === message.clientMsgID,
  );
  const withdrawn = details?.withdrawn;
  const canWithdraw = details
    ? details.allowedActions.includes("withdraw")
    : !researchPointer(message) &&
      isSender &&
      message.status === 2 &&
      Date.now() - message.sendTime < 120000;
  useEffect(
    () => registerTimelineMessage(viewScope, { message, text, details }),
    [viewScope, message, text, details],
  );
  const openAction = (kind: "forward" | "delete" | "withdraw") => {
    if (useChatTimeline.getState().scope === viewScope)
      useChatTimeline.setState({ action: { kind, ids: [message.clientMsgID] } });
  };
  const isDirectChat = useConversationStore(
    (s) => s.currentConversation?.conversationType === SessionType.Single,
  );
  const MessageRenderComponent = components[message.contentType] || CatchMessageRender;

  return (
    <>
      <div
        id={`chat_${message.clientMsgID}`}
        className={clsx(
          "desktop-message-row relative flex select-text px-5 py-3",
          isSender && "desktop-message-row-sender",
          isDirectChat && "desktop-message-row-direct",
          highlighted && "chat-message-highlight",
          (details?.message.origin === "model" || replyAgent) && "chat-agent-row",
        )}
      >
        {selecting && (
          <Checkbox
            aria-label={`选择消息 ${message.senderNickname || ""}`}
            checked={selected}
            onChange={() => selectTimelineMessage(message.clientMsgID)}
            className="chat-message-checkbox"
          />
        )}
        <div
          className={clsx(
            styles["message-container"],
            isSender && styles["message-container-sender"],
          )}
        >
          <OIMAvatar
            size={36}
            userID={message.sendID}
            src={message.senderFaceUrl}
            text={message.senderNickname}
          />

          <div className={styles["message-wrap"]} ref={messageWrapRef}>
            <div className={styles["message-profile"]}>
              <div
                title={authorLabel}
                className={clsx(
                  "max-w-full truncate text-[var(--sub-text)]",
                  isSender ? "ml-2" : "mr-2",
                )}
              >
                {authorLabel}
              </div>
              <div className="text-[var(--sub-text)]">
                {formatMessageTime(message.sendTime)}
              </div>
            </div>

            <Dropdown
              trigger={["contextMenu"]}
              menu={{
                items: [
                  {
                    key: "reply",
                    label: replyAgent ? "回复此助手" : "引用回复",
                    disabled: disabled || !text || withdrawn,
                  },
                  {
                    key: "forward",
                    label: "转发",
                    disabled: disabled || withdrawn || message.status !== 2,
                  },
                  { key: "select", label: "多选" },
                  { key: "delete", label: "本机删除" },
                  ...(canWithdraw
                    ? [{ key: "withdraw", label: "撤回", danger: true }]
                    : []),
                  ...(copyText
                    ? [
                        {
                          key: "copy",
                          label: selectionText ? "复制选中文字" : "复制消息文字",
                        },
                      ]
                    : []),
                ],
                onClick: ({ key }) => {
                  if (key === "forward" || key === "delete" || key === "withdraw")
                    openAction(key);
                  if (key === "select") selectTimelineMessage(message.clientMsgID);
                  if (key === "reply" && text)
                    selectChatReply(
                      message,
                      text,
                      conversationID,
                      generation,
                      replyAgent,
                    );
                  if (key === "copy" && copyText) {
                    if (!navigator.clipboard)
                      feedbackToast({
                        msg: "复制暂不可用，请选中文字复制",
                        error: new Error("剪贴板不可用"),
                      });
                    else
                      void navigator.clipboard
                        .writeText(selectionText || copyText)
                        .then(() => feedbackToast({ msg: "文字已复制" }))
                        .catch((error) =>
                          feedbackToast({ error, msg: "复制失败，请选中文字复制" }),
                        );
                  }
                },
              }}
            >
              <div
                className={styles["menu-wrap"]}
                onContextMenu={(event) => {
                  setSelectionText(
                    selectedMessageText(event.currentTarget, window.getSelection()),
                  );
                }}
              >
                <MessageItemErrorBoundary message={message}>
                  <MessageRenderComponent
                    message={message}
                    isSender={isSender}
                    disabled={disabled}
                    onReadableText={setCanonicalText}
                    onReplyAgent={setReplyAgent}
                    onDetails={setDetails}
                    onReply={
                      !disabled && text
                        ? () =>
                            selectChatReply(
                              message,
                              text,
                              conversationID,
                              generation,
                              replyAgent,
                            )
                        : undefined
                    }
                  />
                </MessageItemErrorBoundary>

                <MessageSuffix
                  message={message}
                  isSender={isSender}
                  disabled={false}
                  conversationID={conversationID}
                />
              </div>
            </Dropdown>
            {!disabled && !withdrawn && text && (
              <button
                type="button"
                className="desktop-reply-action"
                aria-label="引用回复"
                onClick={() =>
                  selectChatReply(message, text, conversationID, generation, replyAgent)
                }
              >
                {replyAgent ? "回复此助手" : "引用"}
              </button>
            )}
            {!disabled && (
              <Dropdown
                trigger={["click"]}
                menu={{
                  items: [
                    {
                      key: "forward",
                      label: "转发",
                      disabled: withdrawn || message.status !== 2,
                    },
                    { key: "select", label: "多选" },
                    { key: "delete", label: "本机删除" },
                    ...(canWithdraw
                      ? [{ key: "withdraw", label: "撤回", danger: true }]
                      : []),
                  ],
                  onClick: ({ key }) => {
                    if (key === "select") selectTimelineMessage(message.clientMsgID);
                    else if (
                      key === "forward" ||
                      key === "delete" ||
                      key === "withdraw"
                    )
                      openAction(key);
                  },
                }}
              >
                <button
                  type="button"
                  className="desktop-reply-action"
                  aria-label="消息操作"
                >
                  更多
                </button>
              </Dropdown>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default memo(MessageItem);
