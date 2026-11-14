import { Alert, Button } from "antd";
import { useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { researchApi } from "./api";
import { usePersonalOperation } from "./usePersonalOperation";
import { findAssistantWorkTask, workbenchTaskPath } from "./workbench-links";
import {
  loadWorkbenchChatContext,
  readWorkbenchServiceOrigin,
  storeNativeWorkbenchHandoff,
} from "./native-workbench-handoff";
import { useResearchStore } from "./store";

export function AssistantWorkTaskButton({
  conversationId,
  turnId,
  native = false,
}: {
  conversationId: string;
  turnId: string;
  native?: boolean;
}) {
  const navigate = useNavigate();
  const operation = usePersonalOperation(
    true,
    `assistant-work-link:${conversationId}:${turnId}`,
  );
  const controller = useRef<AbortController>();
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  useLayoutEffect(() => {
    setBusy(false);
    setFailure("");
    return () => {
      controller.current?.abort();
      controller.current = undefined;
    };
  }, [operation.scope]);
  return (
    <>
      <Button
        size="small"
        loading={busy}
        onClick={async () => {
          if (controller.current) return;
          const { isCurrent } = operation.capture(),
            request = new AbortController();
          controller.current = request;
          setBusy(true);
          setFailure("");
          try {
            const serviceOrigin = native
              ? await readWorkbenchServiceOrigin()
              : undefined;
            if (!isCurrent()) return;
            const id = await findAssistantWorkTask(
              { conversationId, turnId },
              researchApi,
              request.signal,
            );
            if (!isCurrent()) return;
            if (id && native) {
              const initial = useResearchStore.getState();
              if (!initial.actor) return;
              const actor = {
                memberId: initial.actor.member.id,
                labId: initial.actor.member.labId,
                generation: initial.generation,
                serviceOrigin: serviceOrigin!,
              };
              const target = { taskId: id, kind: "personal" as const };
              const chat = await loadWorkbenchChatContext(
                target,
                undefined,
                researchApi,
                request.signal,
              );
              if (!isCurrent()) return;
              if ((await readWorkbenchServiceOrigin()) !== serviceOrigin)
                throw Error("科研服务已切换，请重新打开任务。");
              if (isCurrent())
                navigate(storeNativeWorkbenchHandoff(actor, target, chat).path);
            } else if (id) navigate(workbenchTaskPath(id));
            else
              setFailure(
                "尚未找到这次安排对应的工作台任务，可稍后重试或打开全部任务查看。",
              );
          } catch (error) {
            if (isCurrent())
              setFailure(
                error instanceof Error ? error.message : "任务定位失败，请重试。",
              );
          } finally {
            if (controller.current === request) controller.current = undefined;
            if (isCurrent()) setBusy(false);
          }
        }}
      >
        {native ? "在工作台继续" : "打开对应工作台任务"}
      </Button>
      {failure && (
        <Alert
          type="warning"
          message={failure}
          action={
            <Button size="small" onClick={() => navigate("/workbench?view=tasks")}>
              全部任务
            </Button>
          }
        />
      )}
    </>
  );
}
