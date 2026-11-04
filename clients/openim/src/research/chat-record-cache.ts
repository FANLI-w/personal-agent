import type { ChatRecordKind } from "@/types/chatHistory";
import {
  currentLease,
  forgetLease,
  reportHistoryCacheFailure,
} from "@/pages/chat/queryChat/chat-history-cache";
import { useResearchStore } from "./store";

export type RecordChange = {
  generation: number;
  conversation: string;
  kind: ChatRecordKind;
  id: string;
  unavailable?: boolean;
};
const listeners = new Set<(change: RecordChange) => void>();
const values = new Map<string, unknown>();
const pending = new Map<string, Promise<unknown>>();
const epochs = new Map<string, number>();
const unavailable = new Set<string>();
let generation = -1;
function scope() {
  const current = useResearchStore.getState().generation;
  if (current !== generation) {
    generation = current;
    values.clear();
    pending.clear();
    epochs.clear();
    unavailable.clear();
  }
  return current;
}
const key = (conversation: string, kind: ChatRecordKind, id: string) =>
  JSON.stringify([conversation, kind, id]);
export function chatRecordEpoch(
  conversation: string,
  kind: ChatRecordKind,
  id: string,
) {
  scope();
  return epochs.get(key(conversation, kind, id)) ?? 0;
}
export function seedChatRecord(
  conversation: string,
  kind: ChatRecordKind,
  id: string,
  value: unknown,
) {
  scope();
  const identity = key(conversation, kind, id);
  if (!values.has(identity) && !unavailable.has(identity)) values.set(identity, value);
}
export function onChatRecordChange(listener: (change: RecordChange) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
async function local<T>(
  fn: (
    api: NonNullable<Window["electronAPI"]>["chatHistory"],
    lease: string,
  ) => Promise<T>,
  required = false,
): Promise<T | undefined> {
  const api = window.electronAPI?.chatHistory;
  if (!api) return undefined;
  try {
    const lease = await currentLease();
    if (!lease) {
      if (required) reportHistoryCacheFailure(true);
      return undefined;
    }
    const value = await fn(api, lease);
    if (required) reportHistoryCacheFailure(false);
    return value;
  } catch {
    forgetLease();
    try {
      const lease = await currentLease();
      if (!lease) {
        reportHistoryCacheFailure(true);
        return undefined;
      }
      const value = await fn(api, lease);
      if (required) reportHistoryCacheFailure(false);
      return value;
    } catch {
      forgetLease();
      reportHistoryCacheFailure(true);
      return undefined;
    }
  }
}
export async function cachedChatRecord<T>(
  conversation: string,
  kind: ChatRecordKind,
  id: string,
  parse: (value: unknown) => T,
): Promise<T | undefined> {
  const owner = scope(),
    identity = key(conversation, kind, id),
    epoch = epochs.get(identity);
  if (unavailable.has(identity)) return undefined;
  const raw =
    values.get(identity) ??
    (await local((api, lease) => api.readRecord(lease, conversation, kind, id)));
  if (owner !== scope() || epoch !== epochs.get(identity) || raw == null)
    return undefined;
  try {
    const value = parse(raw);
    values.set(identity, value);
    return value;
  } catch {
    return undefined;
  }
}
export async function saveChatRecord(
  conversation: string,
  kind: ChatRecordKind,
  id: string,
  value: unknown,
  owner = scope(),
  notify = true,
) {
  if (owner !== scope()) return;
  const identity = key(conversation, kind, id);
  const epoch = (epochs.get(identity) ?? 0) + 1;
  epochs.set(identity, epoch);
  const previous = values.get(identity) as
    | { details?: { withdrawn?: boolean } }
    | undefined;
  if (
    kind === "message" &&
    previous?.details?.withdrawn &&
    !(value as typeof previous)?.details?.withdrawn
  )
    return previous;
  const stored = await local(
    (api, lease) =>
      owner === scope()
        ? api.saveRecord(lease, conversation, kind, id, value)
        : Promise.resolve(undefined),
    true,
  );
  if (owner !== scope() || epochs.get(identity) !== epoch) return;
  unavailable.delete(identity);
  values.set(identity, stored ?? value);
  if (values.size > 1000) values.delete(values.keys().next().value!);
  if (notify && owner === scope())
    for (const listener of listeners)
      listener({ generation: owner, conversation, kind, id });
  return stored ?? value;
}
export async function dropChatRecord(
  conversation: string,
  kind: ChatRecordKind,
  id: string,
) {
  const owner = scope(),
    identity = key(conversation, kind, id);
  epochs.set(identity, (epochs.get(identity) ?? 0) + 1);
  values.delete(identity);
  unavailable.add(identity);
  await local((api, lease) => api.removeRecord(lease, conversation, kind, id));
  if (owner === scope())
    for (const listener of listeners)
      listener({ generation: owner, conversation, kind, id, unavailable: true });
}
export function invalidateChatConversation(conversation: string) {
  const owner = scope();
  for (const identity of new Set([
    ...values.keys(),
    ...pending.keys(),
    ...epochs.keys(),
  ])) {
    const [storedConversation, kind, id] = JSON.parse(identity) as [
      string,
      ChatRecordKind,
      string,
    ];
    if (storedConversation !== conversation) continue;
    epochs.set(identity, (epochs.get(identity) ?? 0) + 1);
    values.delete(identity);
    unavailable.add(identity);
    for (const listener of listeners)
      listener({ generation: owner, conversation, kind, id, unavailable: true });
  }
}
export async function loadChatRecord<T>(
  conversation: string,
  kind: ChatRecordKind,
  id: string,
  parse: (value: unknown) => T,
  fetch: () => Promise<T>,
  fresh = false,
): Promise<T> {
  const owner = scope(),
    identity = key(conversation, kind, id),
    epoch = epochs.get(identity);
  if (unavailable.has(identity) && !fresh) throw new Error("这条消息当前无法读取。");
  if (!fresh) {
    const cached = await cachedChatRecord(conversation, kind, id, parse);
    if (cached) return cached;
  }
  if (owner !== scope() || epoch !== epochs.get(identity))
    throw new Error("聊天账号或消息已变化。");
  let flight = pending.get(identity) as Promise<T> | undefined;
  if (!flight) {
    flight = (async () => {
      const value = parse(await fetch());
      if (owner !== scope() || epoch !== epochs.get(identity))
        throw new Error("聊天账号或消息已变化。");
      const saved = await saveChatRecord(conversation, kind, id, value, owner, false);
      if (saved == null) throw new Error("聊天账号或消息已变化。");
      return parse(saved);
    })();
    pending.set(identity, flight);
    void flight
      .finally(() => {
        if (pending.get(identity) === flight) pending.delete(identity);
      })
      .catch(() => {});
  }
  return flight;
}
