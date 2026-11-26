import { RollbackOutlined } from "@ant-design/icons";
import type { ChatMessageDetails, ProjectMessageNotice } from "@research-agent-platform/contracts";
import { Button } from "antd";
import { useNavigate } from "react-router-dom";

import { researchApi } from "./api";
import { NativeWorkbenchTaskButton } from "./NativeWorkbenchTaskButton";
import SafeMessageMarkdown from "./SafeMessageMarkdown";
import { useResearchRead } from "./useResearchRead";
import { workbenchTaskPath } from "./workbench-links";
import "./chat-project-delivery.scss";

export function ChatProjectDelivery({
  taskId,
  messageId,
  kind,
  text,
  source,
  onLocateSource,
}: {
  taskId: string;
  messageId: string;
  kind: ProjectMessageNotice["kind"] | "receipt";
  text: string;
  source?: NonNullable<ChatMessageDetails["replyTo"]>;
  onLocateSource: (source: { messageId: string; sequence: number }) => void;
}) {
  const navigate = useNavigate();
  const read = useResearchRead(
    (signal) => researchApi("personalWorkTask", { params: { id: taskId }, signal }),
    `project-delivery:${taskId}`,
    true,
    { poll: false },
  );
  const task = read.data?.data.id === taskId ? read.data.data : undefined;
  const result = task?.result?.messageId === messageId ? task.result : undefined;
  const canReview =
    (kind === "result" || kind === "receipt") &&
    task &&
    !task.summaryOnly &&
    result &&
    !result.accepted &&
    !result.changesRequested &&
    task.allowedActions.includes("review");
  const sourceText =
    source && !source.withdrawn ? source.text.trim().replace(/\s+/g, " ") : "";
  // The project worker prefixes its canonical result with this fixed introduction.
  const body = kind === "result"
    ? text.replace(/^整理好了，你看一下。\r?\n\r?\n/, "")
    : text;
  const label = kind === "update" ? "任务进展"
    : kind === "result" || (kind === "receipt" && result) ? "任务交付"
    : "任务安排";

  return (
    <article className="chat-project-delivery" aria-label={label}>
      <h3>{task?.title || label}</h3>
      {body.trim() && <SafeMessageMarkdown text={body} />}
      {source && !source.withdrawn && (
        <button
          type="button"
          className="chat-project-delivery-source"
          aria-label={sourceText ? `定位原消息：${sourceText}` : "定位原消息"}
          title={sourceText || undefined}
          onClick={() =>
            onLocateSource({ messageId: source.messageId, sequence: source.sequence })
          }
        >
          <RollbackOutlined aria-hidden />
          <span>{sourceText || "查看原消息"}</span>
        </button>
      )}
      {read.error && <p className="chat-project-delivery-error" role="status">任务状态暂时无法读取</p>}
      <div className="chat-project-delivery-actions">
        <Button
          type={canReview ? "primary" : "default"}
          onClick={() => navigate(workbenchTaskPath(taskId))}
        >
          {canReview ? "查看并验收" : "查看任务"}
        </Button>
        {task && !task.summaryOnly && (
          <NativeWorkbenchTaskButton target={{ taskId, kind: "personal" }} />
        )}
      </div>
    </article>
  );
}
