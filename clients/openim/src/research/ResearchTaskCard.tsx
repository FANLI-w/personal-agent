import type { ChatMessage } from "@research-agent-platform/contracts";
import { Button } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { researchApi } from "./api";
import SafeMessageMarkdown from "./SafeMessageMarkdown";
import { legacyTaskInvitation, taskStatusLabel } from "./task-notice";
import { usePersonalOperation } from "./usePersonalOperation";
import { workbenchTaskPath } from "./workbench-links";

type ChatResource = ChatMessage["resources"][number];

// A task reference on a message is only an id and a version. The reader may be
// the invitee who has no task access yet, so the card never claims a title it
// could not read. The exact task id is retained when opening an unreadable card.
type TaskFacts =
  | { kind: "research" | "personal"; title: string; status: string }
  | { kind: "unknown" };

async function readTaskFacts(id: string, signal: AbortSignal): Promise<TaskFacts> {
  return (async (): Promise<TaskFacts> => {
    try {
      const response = await researchApi("task", { params: { id }, signal });
      const data = response.data as {
        task?: { title?: string; status?: string; visibleStatus?: string };
        title?: string;
        status?: string;
        visibleStatus?: string;
      };
      const task = data.task || data;
      const facts: TaskFacts = {
        kind: "research",
        title: task.title || "科研任务",
        status: task.visibleStatus || task.status || "",
      };
      return facts;
    } catch (error) {
      if ((error as { status?: number }).status !== 404) throw error;
    }
    try {
      const response = await researchApi("personalWorkTask", {
        params: { id },
        signal,
      });
      const task = response.data as {
        title?: string;
        status?: string;
        summaryOnly?: boolean;
      };
      const facts: TaskFacts = {
        kind: "personal",
        title: task.summaryOnly ? "协作任务" : task.title || "协作任务",
        status: task.summaryOnly ? "" : task.status || "",
      };
      return facts;
    } catch (error) {
      if ((error as { status?: number }).status !== 404) throw error;
    }
    return { kind: "unknown" };
  })();
}

function useTaskFacts(resource: ChatResource): {
  facts?: TaskFacts;
  failed?: boolean;
  reload: () => void;
} {
  const id = resource.ref.id;
  const operation = usePersonalOperation(
    true,
    `task-card:${id}:${resource.ref.version}`,
  );
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    scope: string;
    facts?: TaskFacts;
    failed?: boolean;
  }>();
  useEffect(() => {
    const controller = new AbortController(),
      { isCurrent } = operation.capture();
    void readTaskFacts(id, controller.signal).then(
      (facts) => {
        if (isCurrent()) setResult({ scope: operation.scope, facts });
      },
      () => {
        if (isCurrent()) setResult({ scope: operation.scope, failed: true });
      },
    );
    return () => controller.abort();
  }, [operation.scope, attempt]);
  return {
    ...(result?.scope === operation.scope ? result : {}),
    reload: () => {
      setResult(undefined);
      setAttempt((value) => value + 1);
    },
  };
}

function TaskCardBody({ resource }: { resource: ChatResource }) {
  const navigate = useNavigate();
  const { facts, failed, reload } = useTaskFacts(resource);
  const known = facts && facts.kind !== "unknown" ? facts : undefined;
  const unreadable = facts?.kind === "unknown";
  const title =
    known?.title ||
    (unreadable
      ? "这项任务已结束或当前账号没有访问权限"
      : failed
      ? "任务暂时无法读取"
      : "正在读取任务…");
  const status = known ? taskStatusLabel(known.status) : "";
  const open = () =>
    known ? navigate(workbenchTaskPath(resource.ref.id, known.kind)) : reload();
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-800">{title}</p>
        {status && <p className="text-xs text-slate-500">{status}</p>}
      </div>
      <Button size="small" onClick={open}>
        {known ? "打开任务" : "重新读取"}
      </Button>
    </div>
  );
}

/**
 * Renders a task reference as one clickable card. When the whole service
 * message is the invitation, the sentence and the action stay in a single card
 * instead of repeating the task title twice.
 */
export function ResearchTaskCard({
  resource,
  text,
}: {
  resource: ChatResource;
  text?: string;
}) {
  if (text)
    return (
      <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-[11px] font-medium text-slate-500">任务邀请</p>
        <SafeMessageMarkdown text={text} />
        <div className="border-t border-slate-200 pt-2">
          <TaskCardBody resource={resource} />
        </div>
      </div>
    );
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <TaskCardBody resource={resource} />
    </div>
  );
}

/**
 * A server that predates task references on notices still sends the invitation
 * as text. Keep it one card with a way into the inbox rather than a dead
 * sentence, and say plainly that the exact task is opened there.
 */
export function LegacyTaskInviteCard({ text }: { text: string }) {
  const navigate = useNavigate();
  const operation = usePersonalOperation(true, `legacy-task-card:${text}`);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [matches, setMatches] = useState<
    { id: string; title: string; kind: "research" | "personal"; detail: string }[]
  >([]);
  useEffect(() => {
    setMatches([]);
    setFailure("");
    setBusy(false);
  }, [operation.scope]);
  const open = async () => {
    const { isCurrent } = operation.capture();
    if (!isCurrent()) return;
    setBusy(true);
    setFailure("");
    try {
      const title = legacyTaskInvitation(text);
      const found: typeof matches = [];
      let cursor: string | undefined;
      const seen = new Set<string>();
      do {
        const page = await researchApi("workbench", {
          query: { category: "all", limit: 100, cursor },
        });
        if (!isCurrent()) return;
        for (const task of page.data) {
          if (task.taskId && task.title === title && task.source !== "followup")
            found.push({
              id: task.taskId,
              title: task.title,
              kind: task.source === "research_task" ? "research" : "personal",
              detail: `${task.owner.displayName} · ${taskStatusLabel(
                task.status,
              )} · ${new Date(task.updatedAt).toLocaleDateString("zh-CN")}`,
            });
        }
        cursor = page.nextCursor || undefined;
        if (cursor && seen.has(cursor)) throw Error("任务列表读取中断，请重试。");
        if (cursor) seen.add(cursor);
      } while (cursor);
      const unique = [...new Map(found.map((task) => [task.id, task])).values()];
      if (unique.length === 1)
        navigate(workbenchTaskPath(unique[0].id, unique[0].kind));
      else if (unique.length) setMatches(unique);
      else setFailure("这条历史邀请的任务已结束或当前账号没有访问权限。");
    } catch (error) {
      if (isCurrent())
        setFailure(
          error instanceof Error ? error.message : "任务暂时无法读取，请重试。",
        );
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  return (
    <div className="mt-2 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">任务邀请</p>
      <SafeMessageMarkdown text={text} />
      <Button type="primary" loading={busy} onClick={() => void open()}>
        打开任务
      </Button>
      {failure && (
        <p role="alert" className="text-sm text-amber-700">
          {failure}
        </p>
      )}
      {matches.length > 1 && (
        <div>
          <p>有几项同名任务，请选择</p>
          {matches.map((task) => (
            <Button
              key={task.id}
              onClick={() => navigate(workbenchTaskPath(task.id, task.kind))}
            >
              {task.title} · {task.detail}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
