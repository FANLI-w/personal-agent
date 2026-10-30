import type { MessageItem } from "@openim/wasm-client-sdk";

/**
 * One page read from the local transcript.
 *
 * `incomplete` is the honest case: the cached chain stopped before a known
 * beginning, so the caller must verify with the server instead of treating the
 * page as the whole history.
 */
export type ChatHistoryPage = {
  messages: MessageItem[];
  hasMore: boolean;
  reachedStart: boolean;
  incomplete: boolean;
};

export type ChatHistoryLease = { lease: string; memberId: string };

export type ChatHistoryBridge = {
  /** Opens this account's transcript; `null` when there is no verified session. */
  open: () => Promise<ChatHistoryLease | null>;
  close: (lease: string) => Promise<void>;
  page: (
    lease: string,
    conversation: string,
    before?: string,
    count?: number,
  ) => Promise<ChatHistoryPage>;
  savePage: (
    lease: string,
    conversation: string,
    messages: MessageItem[],
    options?: { before?: string; reachedStart?: boolean },
  ) => Promise<void>;
  revoke: (
    lease: string,
    messageId: string,
    patch: Record<string, unknown>,
  ) => Promise<void>;
  remove: (lease: string, messageIds: string[]) => Promise<void>;
  forget: (lease: string, conversation: string) => Promise<void>;
};
