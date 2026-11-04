import { useEffect } from "react";
import type { ChatRecordKind } from "@/types/chatHistory";
import { onChatRecordChange } from "./chat-record-cache";
import { useResearchStore } from "./store";

export function useChatRecordChanges(
  conversation: string | undefined,
  kind: ChatRecordKind,
  id: string | undefined,
  refresh: () => Promise<void>,
  invalidate: (clear?: boolean) => void,
) {
  const generation = useResearchStore((s) => s.generation);
  useEffect(
    () =>
      onChatRecordChange((change) => {
        if (
          change.generation === generation &&
          change.conversation === conversation &&
          change.kind === kind &&
          change.id === id
        ) {
          invalidate(change.unavailable);
          void refresh();
        }
      }),
    [conversation, kind, id, generation, refresh, invalidate],
  );
}
