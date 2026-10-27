import { MessageStatus } from "@openim/wasm-client-sdk";
import { Button, Spin } from "antd";
import { FC, useEffect, useRef, useState } from "react";
import ChatImage from "@/research/ChatImage";
import {
  useAgentChatOperation,
  type AgentChatOperation,
} from "@/research/useAgentChatOperation";
import { useConversationStore, useUserStore } from "@/store";
import { useResearchStore } from "@/research/store";
import { canReadSdkImage, useAgentImageReading } from "@/research/useAgentImageReading";

import { IMessageItemProps } from ".";

const min = (a: number, b: number) => (a > b ? b : a);

const MediaMessageRender: FC<IMessageItemProps> = ({
  message,
  disabled,
  onReply,
  messageMenu,
}) => {
  const capture = useAgentChatOperation();
  const selection = useRef<AgentChatOperation>();
  const fileInput = useRef<HTMLInputElement>(null);
  const reading = useAgentImageReading();
  const [error, setError] = useState("");
  const generation = useResearchStore((s) => s.generation);
  useUserStore((s) => s.selfInfo.userID);
  useResearchStore((s) => s.contacts);
  useResearchStore((s) => s.mappings);
  const conversationID = useConversationStore(
    (s) => s.currentConversation?.conversationID,
  );
  useEffect(() => {
    setError("");
    return () => {
      selection.current?.dispose();
    };
  }, [message.clientMsgID, generation, conversationID]);
  const pictureElem = message.pictureElem;
  if (!pictureElem) throw new Error("Picture message is missing pictureElem");

  const imageHeight = pictureElem.sourcePicture.height;
  const imageWidth = pictureElem.sourcePicture.width;
  const snapshotMaxHeight = pictureElem.snapshotPicture?.height ?? imageHeight;
  const minHeight = min(200, imageWidth) * (imageHeight / Math.max(1, imageWidth)) + 2;
  const adaptedHight = Math.min(minHeight, snapshotMaxHeight, 280) + 10;
  const adaptedWidth = min(imageWidth, 200) + 10;

  const sourceUrl = pictureElem.snapshotPicture?.url || pictureElem.sourcePicture.url;
  const isSending = message.status === MessageStatus.Sending;
  const minStyle = { minHeight: `${adaptedHight}px`, minWidth: `${adaptedWidth}px` };

  return (
    <Spin spinning={isSending}>
      <div className="relative max-w-[200px]" style={minStyle}>
        <ChatImage
          rootClassName="message-image cursor-pointer"
          className="max-w-[200px] rounded-md"
          style={{ maxHeight: 280, objectFit: "contain" }}
          src={sourceUrl}
          alt="聊天图片"
          originalUrl={pictureElem.sourcePicture.url || sourceUrl}
          source={{
            url: pictureElem.sourcePicture.url,
            expectedBytes: pictureElem.sourcePicture.size || 0,
            filename: `图片-${message.clientMsgID.replace(/[^a-zA-Z0-9_-]/g, "_")}.png`,
          }}
          disabled={disabled || isSending}
          onReply={onReply}
          messageMenu={messageMenu}
          placeholder={
            <div style={minStyle} className="flex items-center justify-center">
              <Spin />
            </div>
          }
        />
        {canReadSdkImage(message) && (
          <div data-image-reading-actions>
            <Button
              type="link"
              size="small"
              loading={reading.busy}
              disabled={reading.busy}
              onClick={() =>
                void reading
                  .readExisting(message)
                  .catch((cause) =>
                    setError(cause instanceof Error ? cause.message : "图片识别未完成"),
                  )
              }
            >
              识别并回复
            </Button>
            <Button
              type="link"
              size="small"
              disabled={reading.busy}
              onClick={() => {
                selection.current?.dispose();
                selection.current = capture();
                fileInput.current?.click();
              }}
            >
              从本机选择识别
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0],
                  selected = selection.current;
                event.currentTarget.value = "";
                if (!file || !selected?.isCurrent()) return;
                void reading
                  .readExisting(message, file, selected.isCurrent)
                  .catch((cause) => {
                    if (selected.isCurrent())
                      setError(
                        cause instanceof Error ? cause.message : "图片识别未完成",
                      );
                  })
                  .finally(() => selected.dispose());
              }}
            />
            {reading.controls}
          </div>
        )}
        {error && (
          <p role="alert" className="text-xs text-red-700">
            {error}
          </p>
        )}
      </div>
    </Spin>
  );
};

export default MediaMessageRender;
