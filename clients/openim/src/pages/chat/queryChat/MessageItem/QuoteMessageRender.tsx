import type { IMessageItemProps } from ".";
import { ChatSourceQuote } from "@/research/ChatSourceQuote";
import SafeMessageMarkdown from "@/research/SafeMessageMarkdown";
import { canonicalChatText, isCoordinatorChatContact, readableMessage, useCoordinatorSdkSender } from "@/research/chat-reply";
import styles from "./message-item.module.scss";
import {
  locateMessage,
  timelineScope,
  researchPointer,
} from "@/research/chat-timeline";
import { readChatMessage } from "@/research/chat-message-read";
import { useResearchRead } from "@/research/useResearchRead";
import { useResearchStore } from "@/research/store";
import { useConversationStore } from "@/store";
import { useChatRecordChanges } from '@/research/useChatRecordChanges';
import { watchTranscriptMessage } from '@/research/chat-transcript-sync';
import { useEffect } from 'react';

export default function QuoteMessageRender({ message, previousMessage }: IMessageItemProps) {
  const quote = message.quoteElem;
  const coordinator = useCoordinatorSdkSender(message.sendID);
  const sourceSdkCoordinator = useCoordinatorSdkSender(quote?.quoteMessage?.sendID);
  const adjacentSource = coordinator && quote?.quoteMessage?.clientMsgID &&
    quote.quoteMessage.clientMsgID === previousMessage?.clientMsgID;
  const pointer = !adjacentSource && quote?.quoteMessage ? researchPointer(quote.quoteMessage) : undefined;
  const source = useResearchRead(
    (signal) =>
      readChatMessage(
        pointer!.conversationId,
        pointer!.messageId,
        pointer!.sequence,
        signal,
      ),
    `quote:${pointer?.messageId}`,
    !!pointer,
    { poll: false, keepDataOnError: true },
  );
  useChatRecordChanges(pointer?.conversationId, 'message', pointer?.messageId, source.refresh, source.invalidate);
  const generation = useResearchStore((s) => s.generation),
    id = useConversationStore((s) => s.currentConversation?.conversationID || "");
  const sourceCoordinator = useResearchStore((state) => isCoordinatorChatContact(source.data?.fact.senderContactId, state));
  useEffect(() => pointer ? watchTranscriptMessage(pointer.conversationId, pointer.messageId) : undefined, [pointer?.conversationId, pointer?.messageId, generation]);
  return (
    <div className={`${styles.bubble} chat-plain-message${coordinator ? " chat-assistant-reply" : ""}`}>
      <SafeMessageMarkdown text={readableMessage(message, coordinator)} />
      {quote?.quoteMessage && !adjacentSource && (
        <ChatSourceQuote
          key={quote.quoteMessage.clientMsgID}
          label={quote.quoteMessage.senderNickname || "成员"}
          text={pointer
            ? source.error
              ? "引用内容暂不可读取"
              : source.data
                ? canonicalChatText(source.data.fact, sourceCoordinator) || "引用消息"
                : "正在读取引用…"
            : readableMessage(quote.quoteMessage, sourceSdkCoordinator) || "引用消息"}
          onLocate={() =>
            locateMessage(timelineScope(generation, id), {
              clientMsgID: quote.quoteMessage.clientMsgID,
            })
          }
        />
      )}
    </div>
  );
}
