import { Button, Input, Modal } from "antd";
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
  const [decision, setDecision] = useState<"accept" | "request_changes">();
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
  const requiresComment = target.kind === "research";
  const accept = decision === "accept";
  const actionLabel = accept ? "确认验收" : "退回修改";
  const openReview = (next: NonNullable<typeof decision>) => {
    setError("");
    setDecision(next);
  };
  const review = async () => {
    if (!decision || flight.current || (requiresComment && !comment.trim())) return;
    const { isCurrent } = operation.capture();
    if (!isCurrent()) return;
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
            decision,
            ...(supportsComment && comment.trim() ? { comment: comment.trim() } : {}),
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
      if (isCurrent()) await onChanged();
      if (isCurrent()) {
        setComment("");
        setDecision(undefined);
      }
    } catch (failure) {
      if (isCurrent())
        setError(failure instanceof Error ? failure.message : "审阅未完成，请重试。");
    } finally {
      flight.current = false;
      if (isCurrent()) setBusy(false);
    }
  };
  return (
    <section className="task-result-review" aria-label="验收当前结果">
      <Button
        type="primary"
        disabled={busy}
        onClick={() => openReview("accept")}
      >
        验收通过
      </Button>
      <Button
        disabled={busy}
        onClick={() => openReview("request_changes")}
      >
        退回修改
      </Button>
      <Modal
        title={accept ? "验收当前版本" : "退回当前版本"}
        open={Boolean(decision)}
        okText={actionLabel}
        cancelText="取消"
        onOk={review}
        onCancel={() => { if (!flight.current) setDecision(undefined); }}
        confirmLoading={busy}
        closable={!busy}
        keyboard={!busy}
        maskClosable={false}
        okButtonProps={{ disabled: requiresComment && !comment.trim() }}
        cancelButtonProps={{ disabled: busy }}
        destroyOnClose
      >
        {supportsComment ? (
          <label className="task-review-comment">
            {accept ? "验收意见" : "修改意见"}
            {!requiresComment && "（选填）"}
            <Input.TextArea
              value={comment}
              placeholder={accept ? "哪些内容达到了验收要求？" : "请说明需要修改的具体问题"}
              onChange={(event) => setComment(event.target.value)}
              disabled={busy}
              required={requiresComment}
              rows={3}
              maxLength={8000}
            />
          </label>
        ) : (
          <p>{accept ? "确认验收当前展示的成果。" : "退回后可以在任务聊天里补充修改意见。"}</p>
        )}
        {error && <p className="task-review-error" role="alert">{error}</p>}
      </Modal>
    </section>
  );
}
