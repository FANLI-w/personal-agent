import { create } from "zustand";
import {
  OpenImResearchPointer,
  type ChatMessageDetails,
} from "@research-agent-platform/contracts";
import type { MessageItem } from "@openim/wasm-client-sdk";
import { useResearchStore } from "./store";

export type MessageLocator = {
  clientMsgID?: string;
  messageId?: string;
  sequence?: number;
};
export type TimelineMessage = {
  message: MessageItem;
  text: string;
  details?: ChatMessageDetails;
};
export function researchPointer(message: MessageItem) {
  try {
    const parsed = OpenImResearchPointer.safeParse(
      JSON.parse(message.customElem?.data || "null"),
    );
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
export function matchesLocator(message: MessageItem, locator: MessageLocator) {
  return (
    !!(locator.clientMsgID && message.clientMsgID === locator.clientMsgID) ||
    !!(locator.messageId && researchPointer(message)?.messageId === locator.messageId)
  );
}
type TimelineState = {
  scope: string;
  entries: Record<string, TimelineMessage>;
  selected: string[];
  selecting: boolean;
  hidden: string[];
  action?: { kind: "forward" | "delete" | "withdraw"; ids: string[] };
  jump?: MessageLocator;
  highlighted?: string;
  error?: string;
};
const empty = { entries: {}, selected: [], selecting: false, hidden: [] };
export const useChatTimeline = create<TimelineState>(() => ({ scope: "", ...empty }));
export const timelineScope = (generation: number, id: string) => `${generation}:${id}`;
export function openTimeline(scope: string) {
  if (useChatTimeline.getState().scope !== scope)
    useChatTimeline.setState({
      scope,
      ...empty,
      action: undefined,
      jump: undefined,
      highlighted: undefined,
      error: undefined,
    });
}
export function registerTimelineMessage(scope: string, entry: TimelineMessage) {
  const state = useChatTimeline.getState();
  if (state.scope !== scope) return;
  const id = entry.message.clientMsgID,
    before = state.entries[id];
  if (
    before?.message === entry.message &&
    before?.text === entry.text &&
    before?.details === entry.details
  )
    return;
  useChatTimeline.setState({ entries: { ...state.entries, [id]: entry } });
}
export function selectTimelineMessage(id: string) {
  useChatTimeline.setState((s) => ({
    selecting: true,
    selected: s.selected.includes(id)
      ? s.selected.filter((x) => x !== id)
      : [...s.selected, id].slice(-50),
  }));
}
export function locateMessage(scope: string, locator: MessageLocator) {
  if (useChatTimeline.getState().scope === scope)
    useChatTimeline.setState({ jump: locator, error: undefined });
}
// Reading position and local-only hides retain IDs, never message bodies or credentials.
type Position = { anchor?: string; atBottom: boolean; hidden: string[] };
const positions = new Map<string, Position>();
export function positionKey(actorId: string, conversationID: string) {
  return `${actorId}:${conversationID}`;
}
export function chatPosition(key: string): Position {
  if (!positions.has(key)) {
    try {
      const raw = JSON.parse(
        sessionStorage.getItem(`acceptcat-chat-position:${key}`) || "null",
      );
      if (raw && typeof raw.atBottom === "boolean" && Array.isArray(raw.hidden))
        positions.set(key, {
          anchor: typeof raw.anchor === "string" ? raw.anchor : undefined,
          atBottom: raw.atBottom,
          hidden: raw.hidden
            .filter((id: unknown) => typeof id === "string")
            .slice(-2000),
        });
    } catch {
      /* Optional restoration. */
    }
  }
  if (!positions.has(key)) {
    try {
      const hidden = JSON.parse(
        localStorage.getItem(`acceptcat-chat-hidden:${key}`) || "[]",
      );
      if (Array.isArray(hidden))
        positions.set(key, {
          atBottom: true,
          hidden: hidden.filter((id: unknown) => typeof id === "string").slice(-2000),
        });
    } catch {
      /* In-memory fallback. */
    }
  }
  return positions.get(key) || { atBottom: true, hidden: [] };
}
export function saveChatPosition(key: string, patch: Partial<Position>) {
  const next = { ...chatPosition(key), ...patch };
  positions.set(key, next);
  try {
    sessionStorage.setItem(`acceptcat-chat-position:${key}`, JSON.stringify(next));
  } catch {
    /* In-memory position remains available. */
  }
  if (patch.hidden)
    try {
      localStorage.setItem(`acceptcat-chat-hidden:${key}`, JSON.stringify(next.hidden));
    } catch {
      /* SDK local deletion still applies; retained IDs remain in memory. */
    }
}
useResearchStore.subscribe((next, previous) => {
  if (next.generation !== previous.generation) {
    useChatTimeline.setState({
      scope: "",
      ...empty,
      action: undefined,
      jump: undefined,
      highlighted: undefined,
      error: undefined,
    });
    positions.clear();
  }
});
