import { researchApi, ResearchApiError, supportsTranscriptSync } from "./api";
import { useResearchStore } from "./store";
import { cachedChatRecord, dropChatRecord } from "./chat-record-cache";
import { parseMessageSnapshot, saveTranscriptSnapshot } from "./chat-message-read";

// One bounded synchronizer per conversation, rather than one poll per bubble.
// Readers never await this: an already downloaded transcript is immediately usable.
type Watch = {
  generation: number;
  conversation: string;
  ids: Map<string, number>;
  active: Set<string>;
  cleanup?: () => void;
  timer?: ReturnType<typeof setTimeout>;
  controller?: AbortController;
  unsupported?: boolean;
};
const watches = new Map<string, Watch>();
export function requestTranscriptSync(conversation: string) {
  for (const watch of watches.values()) {
    if (
      watch.conversation !== conversation ||
      watch.generation !== useResearchStore.getState().generation ||
      watch.controller
    )
      continue;
    clearTimeout(watch.timer);
    watch.timer = setTimeout(() => void sync(watch), 0);
  }
}
async function sync(watch: Watch) {
  watch.timer = undefined;
  if (watch.controller || watch.unsupported) return;
  if (watch.generation !== useResearchStore.getState().generation) return;
  if (
    document.visibilityState === "hidden" ||
    navigator.onLine === false ||
    !supportsTranscriptSync()
  ) {
    if (watch.ids.size) watch.timer = setTimeout(() => void sync(watch), 30000);
    return;
  }
  const controller = new AbortController();
  let failed = false;
  watch.controller = controller;
  try {
    const ids = [...watch.ids.keys()];
    for (let start = 0; start < ids.length; start += 20) {
      const known = await Promise.all(
        ids.slice(start, start + 20).map(async (messageId) => {
          const cached = await cachedChatRecord(
            watch.conversation,
            "message",
            messageId,
            parseMessageSnapshot,
          );
          const active = [...(cached?.requests ?? []), ...(cached?.turns ?? [])].some(
            (r) => ["queued", "running", "waiting_input"].includes(r.status),
          );
          if (active) watch.active.add(messageId);
          else watch.active.delete(messageId);
          return {
            messageId,
            revision:
              cached?.requests && cached?.turns ? cached.revision ?? null : null,
          };
        }),
      );
      if (
        controller.signal.aborted ||
        watch.generation !== useResearchStore.getState().generation
      )
        return;
      let result;
      try {
        result = await researchApi("chatTranscriptSync", {
          params: { id: watch.conversation },
          query: { known: JSON.stringify(known) },
          signal: controller.signal,
        });
      } catch (error) {
        // A 0.41 backend has no batch endpoint. Keep cached text working; the
        // companion API upgrade supplies cross-client metadata synchronization.
        if (
          error instanceof ResearchApiError &&
          error.status === 404 &&
          error.code === "HTTP_ERROR"
        ) {
          watch.unsupported = true;
          return;
        }
        throw error;
      }
      if (
        controller.signal.aborted ||
        watch.generation !== useResearchStore.getState().generation
      )
        return;
      await Promise.all(
        result.data.changes.map((snapshot) =>
          saveTranscriptSnapshot(watch.conversation, snapshot, watch.generation),
        ),
      );
      for (const snapshot of result.data.changes) {
        const id = snapshot.details.message.id;
        if (
          [...snapshot.requests, ...snapshot.turns].some((r) =>
            ["queued", "running", "waiting_input"].includes(r.status),
          )
        )
          watch.active.add(id);
        else watch.active.delete(id);
      }
      await Promise.all(
        result.data.unavailableIds.map((id) =>
          dropChatRecord(watch.conversation, "message", id),
        ),
      );
    }
  } catch (error) {
    failed = true;
    // Transient offline failures never remove downloaded text. Actual lost
    // authority invalidates the affected visible snapshots immediately.
    if (
      !controller.signal.aborted &&
      watch.generation === useResearchStore.getState().generation &&
      error instanceof ResearchApiError &&
      [401, 403, 404].includes(error.status)
    ) {
      await Promise.all(
        [...watch.ids.keys()].map((id) =>
          dropChatRecord(watch.conversation, "message", id),
        ),
      );
    }
  } finally {
    if (watch.controller === controller) watch.controller = undefined;
    if (
      watch.ids.size &&
      watch.generation === useResearchStore.getState().generation &&
      !watch.unsupported
    )
      watch.timer = setTimeout(
        () => void sync(watch),
        !failed && watch.active.size ? 5000 : 30000,
      );
  }
}
export function watchTranscriptMessage(conversation: string, messageId: string) {
  const generation = useResearchStore.getState().generation,
    key = JSON.stringify([generation, conversation]);
  let watch = watches.get(key);
  if (!watch) {
    watch = { generation, conversation, ids: new Map(), active: new Set() };
    watches.set(key, watch);
    const current = watch;
    const resume = () => {
      if (document.visibilityState !== "hidden") {
        clearTimeout(current.timer);
        void sync(current);
      }
    };
    window.addEventListener?.("online", resume);
    window.addEventListener?.("focus", resume);
    document.addEventListener?.("visibilitychange", resume);
    current.cleanup = () => {
      window.removeEventListener?.("online", resume);
      window.removeEventListener?.("focus", resume);
      document.removeEventListener?.("visibilitychange", resume);
    };
  }
  watch.ids.set(messageId, (watch.ids.get(messageId) ?? 0) + 1);
  if (!watch.timer && !watch.controller)
    watch.timer = setTimeout(() => void sync(watch!), 300);
  return () => {
    const count = (watch!.ids.get(messageId) ?? 1) - 1;
    if (count) watch!.ids.set(messageId, count);
    else {
      watch!.ids.delete(messageId);
      watch!.active.delete(messageId);
    }
    if (!watch!.ids.size) {
      clearTimeout(watch!.timer);
      watch!.controller?.abort();
      watch!.cleanup?.();
      watches.delete(key);
    }
  };
}
