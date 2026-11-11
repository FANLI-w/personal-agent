import "./task-workspace.scss";
import type { ReactNode } from "react";
import { PersonalWorkDetail } from "./PersonalWorkDetail";
import { ResearchTaskPanel } from "./ResearchTaskPanel";
import { TaskWorkPage } from "./TaskWorkPage";

export function TaskWorkspace({
  list,
  children,
}: {
  list: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="workspace-task-body">
      <aside className="workspace-task-list" aria-label="任务列表">
        {list}
      </aside>
      <main className="workspace-detail-pane" aria-label="任务详情">
        {children}
      </main>
    </div>
  );
}

export function TaskListRow({
  title,
  status,
  description,
  meta,
  hint,
  selected,
  onSelect,
}: {
  title: string;
  status: string;
  description: string;
  meta: string;
  hint?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button className="workspace-task-row" aria-pressed={selected} onClick={onSelect}>
      <span className="workspace-task-row-title">{title}</span>
      <span className="workspace-status">{status}</span>
      <p>{description}</p>
      <footer>{meta}</footer>
      {hint && <small className="workspace-task-row-hint">{hint}</small>}
    </button>
  );
}

/** Both list views open the same task work page and the same authorized actions. */
export function WorkspaceTaskDetail({
  taskId,
  kind,
  onChanged,
}: {
  taskId: string;
  kind: "personal" | "research";
  onChanged: () => Promise<void>;
}) {
  return (
    <TaskWorkPage taskId={taskId} kind={kind} onChanged={onChanged}>
      {(refresh) =>
        kind === "research" ? (
          <div className="workspace-task-detail">
            <ResearchTaskPanel taskId={taskId} onChanged={refresh} embedded />
          </div>
        ) : (
          <PersonalWorkDetail taskId={taskId} onChanged={refresh} embedded />
        )
      }
    </TaskWorkPage>
  );
}
