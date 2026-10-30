import type { MessageItem } from "@openim/wasm-client-sdk";

import type { ChatHistoryPage } from "@/types/chatHistory";

const bridge = () => window.electronAPI?.chatHistory;

/**
 * One lease per app session. The main process decides which account it belongs
 * to and drops it when the cookie changes, so a stale promise is re-opened
 * instead of being reused for a different login.
 */
let lease: Promise<string | null> | null = null;

function currentLease() {
  const api = bridge();
  if (!api) return Promise.resolve(null);
  lease ??= api
    .open()
    .then((value) => value?.lease ?? null)
    .catch(() => null)
    // A failure at startup (service not connected yet) must not be remembered
    // as "this app never has a cache"; only a success is worth keeping.
    .then((value) => {
      if (!value) lease = null;
      return value;
    });
  return lease;
}

function forgetLease() {
  lease = null;
}

/**
 * The local transcript is an optimization, never an authority: every helper
 * here swallows its own failures so a cache problem can only make the chat
 * slower, not broken.
 */
export async function readCachedHistory(
  conversation: string,
  count: number,
): Promise<ChatHistoryPage | null> {
  const api = bridge();
  if (!api) return null;
  const open = await currentLease();
  if (!open) return null;
  try {
    return await api.page(open, conversation, undefined, count);
  } catch {
    forgetLease();
    return null;
  }
}

export async function saveCachedHistory(
  conversation: string,
  messages: MessageItem[],
  options: { before?: string; reachedStart?: boolean },
) {
  const api = bridge();
  if (!api || !messages.length) return;
  const open = await currentLease();
  if (!open) return;
  try {
    await api.savePage(open, conversation, messages, options);
  } catch {
    forgetLease();
  }
}

/** Records a withdrawal this machine observed, so a later history page cannot undo it. */
export async function rememberWithdrawal(
  messageId: string,
  patch: Record<string, unknown>,
) {
  const api = bridge();
  if (!api) return;
  const open = await currentLease();
  if (!open) return;
  try {
    await api.revoke(open, messageId, patch);
  } catch {
    forgetLease();
  }
}
