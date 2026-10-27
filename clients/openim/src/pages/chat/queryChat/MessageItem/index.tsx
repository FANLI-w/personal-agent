import {
  MessageItem as MessageItemType,
  MessageType,
  SessionType,
} from "@openim/wasm-client-sdk";
import clsx from "clsx";
import { FC, memo, useRef, useState } from "react";
import { Dropdown } from "antd";
import { selectChatReply, readableMessage, type ReplyAgent } from "@/research/chat-reply";
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

export interface IMessageItemProps {
  message: MessageItemType;
  isSender: boolean;
  disabled?: boolean;
  conversationID?: string;
  messageUpdateFlag?: string;
  onReadableText?: (text: string) => void;
  onReplyAgent?: (agent: ReplyAgent | undefined) => void;
  onReply?: () => void;
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
        )}
      >
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
                title={message.senderNickname}
                className={clsx(
                  "max-w-[10em] truncate text-[var(--sub-text)]",
                  isSender ? "ml-2" : "mr-2",
                )}
              >
                {message.senderNickname}
              </div>
              <div className="text-[var(--sub-text)]">
                {formatMessageTime(message.sendTime)}
              </div>
            </div>

            <Dropdown
              disabled={message.contentType === MessageType.PictureMessage}
              trigger={["contextMenu"]}
              menu={{
                items: [
                  { key: "reply", label: "引用回复", disabled: disabled || !text },
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
                  if (key === "reply" && text)
                    selectChatReply(message, text, conversationID, generation, replyAgent);
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
                    onReply={
                      !disabled && text
                        ? () =>
                            selectChatReply(message, text, conversationID, generation, replyAgent)
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
            {!disabled && text && (
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
          </div>
        </div>
      </div>
    </>
  );
};

export default memo(MessageItem);
