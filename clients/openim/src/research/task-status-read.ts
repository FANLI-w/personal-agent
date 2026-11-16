import type { TaskTarget } from "../../../../integrations/deepseek-harness/desktop/task-workspace";

/** Check the live hash too: native navigation can precede React effect cleanup. */
export function taskStatusRouteMatches(hash: string, target: TaskTarget) {
  const [route, query = ""] = hash.replace(/^#/, "").split("?");
  const params = new URLSearchParams(query);
  return ["/workbench", "/dsh"].includes(route.replace(/\/+$/, "")) &&
    params.get("task") === target.taskId &&
    (params.get("taskKind") || "personal") === target.kind;
}

/** Electron adds an IPC envelope; keep the underlying failure for inspection. */
export function taskStatusFailure(failure: unknown, fallback = "本地进度暂不可用。") {
  const message = failure instanceof Error ? failure.message : fallback;
  return message.replace(/^Error invoking remote method ['"][^'"]+['"]:\s*(?:Error:\s*)?/, "");
}
