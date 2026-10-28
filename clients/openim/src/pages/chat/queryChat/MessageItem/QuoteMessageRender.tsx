import type { IMessageItemProps } from ".";
import SafeMessageMarkdown from "@/research/SafeMessageMarkdown";
import { readableMessage } from "@/research/chat-reply";
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

export default function QuoteMessageRender({ message }: IMessageItemProps) {
  const quote = message.quoteElem;
  const pointer = quote?.quoteMessage ? researchPointer(quote.quoteMessage) : undefined;
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
  );
  const generation = useResearchStore((s) => s.generation),
    id = useConversationStore((s) => s.currentConversation?.conversationID || "");
  return (
    <div className={styles.bubble}>
      <SafeMessageMarkdown text={quote?.text || ""} />
      {quote?.quoteMessage && (
        <button
          type="button"
          className="desktop-message-quote chat-source-link"
          onClick={() =>
            locateMessage(timelineScope(generation, id), {
              clientMsgID: quote.quoteMessage.clientMsgID,
            })
          }
        >
          <strong>{quote.quoteMessage.senderNickname || "成员"}</strong>
          <p>
            {pointer
              ? source.error
                ? "引用内容暂不可读取"
                : source.data?.fact.text || "正在读取引用…"
              : readableMessage(quote.quoteMessage) || "引用消息"}
          </p>
        </button>
      )}
    </div>
  );
}
