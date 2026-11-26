import { Button } from "antd";
import { ExportOutlined } from "@ant-design/icons";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { researchApi } from "./api";
import {
  loadWorkbenchChatContext,
  readWorkbenchServiceOrigin,
  storeNativeWorkbenchHandoff,
  type WorkbenchMessageSource,
  type WorkbenchTarget,
} from "./native-workbench-handoff";
import { useResearchStore } from "./store";
import { usePersonalOperation } from "./usePersonalOperation";

export function NativeWorkbenchTaskButton({
  target,
  source,
  primary = false,
  revision = false,
}: {
  target: WorkbenchTarget;
  source?: WorkbenchMessageSource;
  primary?: boolean;
  revision?: boolean;
}) {
  const navigate = useNavigate();
  const operation = usePersonalOperation(
    true,
    `native-task:${target.kind}:${target.taskId}:${source?.conversationId}:${source?.messageId}`,
  );
  const controller = useRef<AbortController>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setBusy(false);
    setError("");
    return () => {
      controller.current?.abort();
      controller.current = undefined;
    };
  }, [operation.scope]);
  return (
    <span className={revision ? "blue-task-revision-handoff" : "inline-flex flex-col items-start gap-1"}>
      <Button
        size={primary ? "middle" : "small"}
        type={primary ? "primary" : "default"}
        loading={busy}
        onClick={async () => {
          if (controller.current) return;
          const { isCurrent } = operation.capture();
          const initial = useResearchStore.getState();
          if (!initial.actor || !isCurrent()) return;
          const request = new AbortController();
          controller.current = request;
          setBusy(true);
          setError("");
          try {
            const serviceOrigin = await readWorkbenchServiceOrigin();
            if (!isCurrent()) return;
            const scope = {
              memberId: initial.actor.member.id,
              labId: initial.actor.member.labId,
              generation: initial.generation,
              serviceOrigin,
            };
            const chat = await loadWorkbenchChatContext(
              target,
              source,
              researchApi,
              request.signal,
            );
            if (!isCurrent()) return;
            if ((await readWorkbenchServiceOrigin()) !== serviceOrigin)
              throw Error("科研服务已切换，请重新打开任务。");
            if (!isCurrent()) return;
            navigate(storeNativeWorkbenchHandoff(scope, target, chat, undefined, revision ? "assistant" : undefined).path);
          } catch (failure) {
            if (isCurrent())
              setError(
                failure instanceof Error
                  ? failure.message
                  : "工作台背景暂未准备好，请重试。",
              );
          } finally {
            if (controller.current === request) controller.current = undefined;
            if (isCurrent()) setBusy(false);
          }
        }}
      >
        {revision ? <>在 DSH 中改稿 <ExportOutlined aria-hidden /></> : "在工作台继续"}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-amber-800">
          {error}
        </span>
      )}
    </span>
  );
}
