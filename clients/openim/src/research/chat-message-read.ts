import {
  ChatMessage,
  ChatMessageDetails,
  AgentTurn,
  GroupAgentStatus,
  type TranscriptSnapshot,
} from "@research-agent-platform/contracts";
import { researchApi, ResearchApiError, supportsTranscriptSync } from "./api";
import { useResearchStore } from "./store";
import {
  cachedChatRecord,
  loadChatRecord,
  saveChatRecord,
  dropChatRecord,
  seedChatRecord,
} from "./chat-record-cache";
export type MessageSnapshot = {
  fact: ChatMessage;
  details?: ChatMessageDetails;
  revision?: string;
  requests?: TranscriptSnapshot["requests"];
  turns?: AgentTurn[];
};
export function parseMessageSnapshot(raw: unknown): MessageSnapshot {
  const value = raw as MessageSnapshot;
  const fact = ChatMessage.parse(value?.fact);
  const details = value.details ? ChatMessageDetails.parse(value.details) : undefined;
  if (
    details &&
    (details.message.id !== fact.id ||
      details.message.conversationId !== fact.conversationId ||
      details.message.sequence !== fact.sequence)
  )
    throw new Error("本机消息记录不一致。");
  return {
    fact,
    details,
    revision: value.revision,
    requests: value.requests
      ? GroupAgentStatus.array().max(5).parse(value.requests)
      : undefined,
    turns: value.turns ? AgentTurn.array().max(5).parse(value.turns) : undefined,
  };
}
export const activeChatTurn = (value: { data: AgentTurn } | undefined) =>
  !!value && ["queued", "running", "waiting_input"].includes(value.data.status);
export async function cacheChatTurnResult(
  turn: AgentTurn,
  generation: number,
  replacesInputTurn = false,
) {
  const conversation = turn.conversationId;
  await saveChatRecord(conversation, "turn", turn.id, { data: turn }, generation);
  const message = await cachedChatRecord(
    conversation,
    "message",
    turn.inputMessageId,
    parseMessageSnapshot,
  );
  if (!message || generation !== useResearchStore.getState().generation) return;
  const fact = {
    ...message.fact,
    turnId: replacesInputTurn ? turn.id : message.fact.turnId,
  };
  const requests = message.requests?.map((request) =>
    request.agentContactId === turn.agentContactId
      ? {
          ...request,
          id: turn.id,
          status: turn.status,
          failure: turn.failure,
          outputMessageId: turn.outputMessageId,
          updatedAt: turn.updatedAt,
        }
      : request,
  );
  await saveChatRecord(
    conversation,
    "message",
    fact.id,
    {
      ...message,
      fact,
      details: message.details ? { ...message.details, message: fact } : undefined,
      revision: undefined,
      requests,
      turns: [
        ...(message.turns ?? []).filter(
          (previous) => previous.agentContactId !== turn.agentContactId,
        ),
        turn,
      ].slice(-5),
    },
    generation,
  );
  if (requests)
    await saveChatRecord(
      conversation,
      "group-status",
      fact.id,
      { data: { requests } },
      generation,
    );
}
export async function readChatTurn(conversation: string, id: string) {
  const parse = (raw: unknown) => {
    const data = AgentTurn.parse((raw as { data: unknown })?.data);
    if (data.id !== id || data.conversationId !== conversation)
      throw new Error("AI 状态与会话不一致。");
    return { data };
  };
  const cached = await cachedChatRecord(conversation, "turn", id, parse);
  return loadChatRecord(
    conversation,
    "turn",
    id,
    parse,
    () => researchApi("chatTurn", { params: { id } }),
    activeChatTurn(cached) && !supportsTranscriptSync(),
  );
}
export async function readGroupStatuses(
  conversation: string,
  messageId: string,
  fresh = false,
) {
  const parse = (raw: unknown) => ({
    data: {
      requests: GroupAgentStatus.array()
        .max(5)
        .parse((raw as { data?: { requests: unknown } })?.data?.requests),
    },
  });
  const cached = await cachedChatRecord(conversation, "group-status", messageId, parse);
  return loadChatRecord(
    conversation,
    "group-status",
    messageId,
    parse,
    () =>
      researchApi("chatMessageAgentStatuses", {
        params: { id: conversation, messageId },
      }),
    fresh ||
      (!supportsTranscriptSync() &&
        !!cached?.data.requests.some((r) =>
          ["queued", "running", "waiting_input"].includes(r.status),
        )),
  );
}
export async function saveTranscriptSnapshot(
  conversation: string,
  snapshot: TranscriptSnapshot,
  generation: number,
) {
  if (snapshot.details.message.conversationId !== conversation)
    throw new Error("同步消息与会话不一致。");
  await Promise.all([
    saveChatRecord(
      conversation,
      "message",
      snapshot.details.message.id,
      {
        fact: snapshot.details.message,
        details: snapshot.details,
        revision: snapshot.revision,
        requests: snapshot.requests,
        turns: snapshot.turns,
      },
      generation,
    ),
    saveChatRecord(
      conversation,
      "group-status",
      snapshot.details.message.id,
      { data: { requests: snapshot.requests } },
      generation,
    ),
    ...snapshot.turns.map((data) =>
      saveChatRecord(conversation, "turn", data.id, { data }, generation),
    ),
  ]);
}
let capability: { generation: number; supported: boolean } | undefined;
export const hasMessageDetails = () =>
  capability?.generation === useResearchStore.getState().generation &&
  capability.supported;
export async function readChatMessage(
  conversationId: string,
  messageId: string,
  sequence: number,
  signal?: AbortSignal,
  fresh = false,
) {
  const parse = (value: unknown) => {
    const snapshot = parseMessageSnapshot(value);
    if (
      snapshot.fact.id !== messageId ||
      snapshot.fact.conversationId !== conversationId ||
      snapshot.fact.sequence !== sequence
    )
      throw new Error("消息与会话不一致。");
    return snapshot;
  };
  try {
    const value = await loadChatRecord(
      conversationId,
      "message",
      messageId,
      parse,
      () => fetchChatMessage(conversationId, messageId, sequence),
      fresh,
    );
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    // The complete sync snapshot is atomic in SQLite. Secondary in-memory
    // indexes can be rebuilt from it after restart or a partial auxiliary write.
    if (value.requests)
      seedChatRecord(conversationId, "group-status", messageId, {
        data: { requests: value.requests },
      });
    for (const data of value.turns ?? [])
      seedChatRecord(conversationId, "turn", data.id, { data });
    return value;
  } catch (error) {
    if (error instanceof ResearchApiError && [401, 403, 404].includes(error.status))
      await dropChatRecord(conversationId, "message", messageId);
    throw error;
  }
}
async function fetchChatMessage(
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
