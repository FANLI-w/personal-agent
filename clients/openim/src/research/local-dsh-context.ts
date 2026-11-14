import { Id } from "@research-agent-platform/contracts";
import type {
  DshTaskState,
  TaskTarget,
} from "../../../../integrations/deepseek-harness/desktop/task-workspace";
import type { WorkbenchActorScope } from "./native-workbench-handoff";

/** Navigation instructions remain drafts; opening or retrying DSH never sends them. */
export function workbenchInstructionKey(
  actor: WorkbenchActorScope,
  target: TaskTarget,
) {
  return (
    "acceptcat-workbench-instruction:v1:" +
    JSON.stringify([
      actor.serviceOrigin,
      actor.memberId,
      actor.labId,
      actor.generation,
      target.kind,
      target.taskId,
    ])
  );
}
export function storeWorkbenchInstruction(
  storage: Pick<Storage, "setItem" | "removeItem">,
  key: string,
  text: string,
) {
  if (!text.trim()) {
    storage.removeItem(key);
    return;
  }
  storage.setItem(
    key,
    JSON.stringify({
      version: 1,
      text: text.trim().slice(0, 4000),
      requestId: crypto.randomUUID(),
      createdAt: Date.now(),
    }),
  );
}
export function readWorkbenchInstruction(
  storage: Pick<Storage, "getItem">,
  key: string,
) {
  try {
    const draft = JSON.parse(storage.getItem(key) || "null");
    if (
      draft?.version === 1 &&
      typeof draft.text === "string" &&
      draft.text.trim() &&
      draft.text.length <= 4000 &&
      Id.safeParse(draft.requestId).success &&
      Number.isFinite(draft.createdAt) &&
      draft.createdAt <= Date.now() &&
      Date.now() - draft.createdAt <= 15 * 60 * 1000
    )
      return { text: draft.text as string, requestId: draft.requestId as string };
  } catch {
    /* Unavailable or invalid drafts do not cross into the model. */
  }
  return undefined;
}

/** A pointer only: task authority and its local binding are checked again on every resume. */
export function recentWorkbenchKey(service: string, memberId: string, labId: string) {
  return "acceptcat-workbench-recent:v1:" + JSON.stringify([service, memberId, labId]);
}

export function readRecentWorkbench(
  storage: Pick<Storage, "getItem">,
  key: string,
): TaskTarget | undefined {
  try {
    const value = JSON.parse(storage.getItem(key) || "null");
    if (
      value &&
      ["research", "personal"].includes(value.kind) &&
      Id.safeParse(value.taskId).success
    )
      return { kind: value.kind, taskId: value.taskId };
  } catch {
    /* Storage may be unavailable; a recent task is optional. */
  }
  return undefined;
}

/** Input copies and provenance files never become deliverable suggestions. */
export function workbenchOutputs(state?: DshTaskState) {
  if (!state) return [];
  const inputs = new Set([
    ...state.binding.sources.map((source) => source.localName),
    ...(state.binding.localMaterials || []).map((source) => source.localName),
  ]);
  return state.files.filter(
    (file) => !inputs.has(file.name) && !file.name.startsWith(".acceptcat"),
  );
}
