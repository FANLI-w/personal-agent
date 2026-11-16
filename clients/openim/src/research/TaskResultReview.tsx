import { App, Button, Input } from "antd";
import { useRef, useState } from "react";
import { researchApi } from "./api";
import { usePersonalOperation } from "./usePersonalOperation";
import type { TaskTarget } from "../../../../integrations/deepseek-harness/desktop/task-workspace";

/** Keep the exact result and task versions beside the result being reviewed. */
export function TaskResultReview({
  target,
  taskVersion,
  messageId,
  delivery,
  onChanged,
  supportsComment = true,
}: {
  target: TaskTarget;
  taskVersion: number;
  messageId?: string | null;
  delivery?: { id: string; version: number; revision: number };
  onChanged: () => Promise<void>;
  supportsComment?: boolean;
}) {
  const { modal } = App.useApp();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const flight = useRef(false);
  const operation = usePersonalOperation(
    true,
    `review:${target.kind}:${target.taskId}:${
      messageId || delivery?.id
    }:${taskVersion}`,
  );
  const review = (accept: boolean) => {
    const { isCurrent } = operation.capture();
    modal.confirm({
      title: accept ? "验收当前结果？" : "要求修改当前结果？",
      content: comment || "核对当前展示的这一版结果。",
      onOk: async () => {
        if (!isCurrent() || flight.current) return;
        flight.current = true;
        setBusy(true);
        setError("");
        try {
          if (target.kind === "personal" && messageId)
            await researchApi("reviewPersonalWorkResult", {
              params: { id: target.taskId },
              body: {
                expectedVersion: taskVersion,
                messageId,
                decision: accept ? "accept" : "request_changes",
                ...(supportsComment && comment.trim()
                  ? { comment: comment.trim() }
                  : {}),
              },
            });
          else if (delivery)
            await researchApi("review", {
              params: { id: delivery.id },
              body: {
                expectedVersion: delivery.version,
                expectedTaskVersion: taskVersion,
                revision: delivery.revision,
                decision: accept ? "accepted" : "changes_requested",
                comment: comment.trim(),
              },
            });
          if (isCurrent()) {
            setComment("");
            await onChanged();
          }
        } catch (failure) {
          if (isCurrent())
            setError(
              failure instanceof Error ? failure.message : "审阅未完成，请重试。",
            );
        } finally {
          if (isCurrent()) {
            flight.current = false;
            setBusy(false);
          }
        }
      },
    });
  };
  return (
    <section className="task-result-review" aria-label="验收当前结果">
      <h3>核对当前结果</h3>
      {supportsComment && (
        <Input.TextArea
          aria-label="验收意见"
          placeholder="达到要求的地方，或需要修改的具体问题"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          disabled={busy}
          rows={3}
        />
      )}
      <Button
        type="primary"
        disabled={busy || (target.kind === "research" && !comment.trim())}
        loading={busy}
        onClick={() => review(true)}
      >
        确认验收
      </Button>
      <Button
        disabled={busy || (target.kind === "research" && !comment.trim())}
        onClick={() => review(false)}
      >
        要求修改
      </Button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
