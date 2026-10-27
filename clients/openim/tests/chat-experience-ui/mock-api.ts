import { roster, useResearchStore } from "./mock-state";
export const researchMode = true;
export class ResearchApiError extends Error {}
export const calls: any[] = [];
export const turns: any[] = [];
export const messages: any[] = [];
export function clearResearchSession() {}
export async function researchApi(name: string, options: any = {}) {
  calls.push({
    name,
    actor: useResearchStore.getState().actor.member.id,
    options: JSON.parse(JSON.stringify(options)),
  });
  const group = {
    id: "group",
    version: 1,
    kind: "group",
    taskIds: [],
    allowedActions: ["send"],
    members: roster.map((c) => ({ contactId: c.id, status: "joined" })),
  };
  if (name === "chatConversation") return { data: group };
  if (name === "chatConversationContacts") return { data: roster };
  if (name === "chatMessages") return { data: messages, cursor: null };
  if (name === "chatMessageAgentStatuses")
    return {
      data: {
        requests: turns
          .filter((t) => t.inputMessageId === options.params.messageId)
          .map((t) => ({
            ...t,
            displayName: roster.find((c) => c.id === t.agentContactId)?.displayName,
          })),
      },
    };
  if (name === "chatTurn")
    return { data: turns.find((t) => t.id === options.params.id) };
  if (name === "chatTurnProgress") {
    const turn = turns.find((t) => t.id === options.params.id);
    if (!turn) throw new Error("no fixture turn");
    return {
      data: {
        turnId: turn.id,
        conversationId: "group",
        inputMessageIds: [turn.inputMessageId],
        revision: turn.version,
        phase: turn.status === "cancelled" ? "stopped" : "streaming",
        text:
          turn.status === "cancelled"
            ? ""
            : turn.agentContactId === "agent_mine"
            ? "我会先比较各篇论文的样本与实验设置。"
            : "我会检查比较是否控制了相同条件，并列出需要补充的证据。",
        finalMessageId: null,
        supersededByTurnId: null,
        updatedAt: new Date().toISOString(),
      },
    };
  }
  if (name === "sendChatMessage" || name === "agentChatMessage") {
    const message = {
      id: "msg_" + (messages.length + 1),
      text: options.body.text,
      conversationId: "group",
      sequence: messages.length + 1,
      origin: "human",
      senderContactId: "human_me",
      mentions: options.body.mentions || [],
      actionIds: [],
      resources: [],
      turnId: null,
      createdAt: new Date().toISOString(),
    };
    messages.push(message);
    const ids =
      options.body.agentContactIds || [options.body.agentContactId].filter(Boolean);
    const added = ids.map((id: string) => ({
      id: "turn_" + (turns.length + 1) + "_" + id,
      conversationId: "group",
      inputMessageId: message.id,
      agentContactId: id,
      status: "running",
      failure: null,
      availability: { status: "available", reason: null },
      allowedActions: ["cancel"],
      budget: { maxTokens: 16000, maxSeconds: 90 },
      remainingBudget: { maxTokens: 15000, maxSeconds: 80 },
      usage: null,
      outputMessageId: null,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    turns.push(...added);
    message.turnId = added[0]?.id || null;
    return {
      data: {
        message,
        turn: added[0] || null,
        ...(added.length > 1 ? { turns: added } : {}),
      },
    };
  }
  if (name === "cancelChatTurn") {
    const turn = turns.find((t) => t.id === options.params.id);
    turn.status = "cancelled";
    turn.allowedActions = [];
    turn.version++;
    return { data: { ...turn } };
  }
  if (name === "retryChatTurn") {
    const turn = turns.find((t) => t.id === options.params.id);
    if (turn.version !== options.body.expectedVersion)
      throw new Error("fixture version conflict");
    turn.status = "running";
    turn.failure = null;
    turn.allowedActions = ["cancel"];
    turn.version++;
    return { data: { ...turn } };
  }
  throw new Error("Unexpected fixture API: " + name);
}
