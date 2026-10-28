import type { ChatMessageDetails } from "@research-agent-platform/contracts";
import { researchApi, ResearchApiError } from "./api";
import { useResearchStore } from "./store";
let capability: { generation: number; supported: boolean } | undefined;
export const hasMessageDetails = () =>
  capability?.generation === useResearchStore.getState().generation &&
  capability.supported;
export async function readChatMessage(
  conversationId: string,
  messageId: string,
  sequence: number,
  signal?: AbortSignal,
) {
  const generation = useResearchStore.getState().generation;
  if (capability?.generation !== generation || capability.supported) {
    try {
      const { data } = await researchApi("chatMessageDetails", {
        params: { id: conversationId, messageId },
        signal,
      });
      if (generation === useResearchStore.getState().generation)
        capability = { generation, supported: true };
      return { fact: data.message, details: data };
    } catch (error) {
      if (!(error instanceof ResearchApiError) || error.status !== 404) throw error;
    }
  }
  const response = await researchApi("chatMessages", {
    params: { id: conversationId },
    query: { afterSequence: sequence - 1, limit: 1 },
    signal,
  });
  const fact = response.data.find((m) => m.id === messageId && m.sequence === sequence);
  if (!fact) throw new Error("暂未找到这条消息，请重新读取。");
  // A known message accessible via the old route establishes an older backend.
  if (generation === useResearchStore.getState().generation)
    capability = { generation, supported: false };
  return { fact, details: undefined as ChatMessageDetails | undefined };
}
