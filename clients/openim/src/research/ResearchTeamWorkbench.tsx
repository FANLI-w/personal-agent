import { Alert, Button, Drawer, Input, Segmented, Select } from "antd";
import { DownOutlined, FilterOutlined, RightOutlined } from "@ant-design/icons";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { researchApi } from "./api";
import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";
import {
  isFullTask,
  teamDeadline,
  teamNextStep,
  teamTaskStatus,
} from "./research-team";
import { workspaceStatusLabel } from "./workspace-labels";
import { ResearchTeamAccountHint } from "./ResearchTeamAccountHint";
import { collectTeamWorkspace, teamDirections } from "./team-progress";
import {
  TaskWorkspace,
  TaskReadNotice,
  WorkspaceTaskDetail,
} from "./TaskWorkspace";
import { transientReadFailure } from "./read-errors";
import { TaskWeekSchedule, taskDate, taskDeadline, taskSchedule } from "./TaskWeekSchedule";
import { TaskDeliveryDownload } from "./TaskDeliveryDownload";
import { deliveryDisplaySummary } from "./task-delivery-command";

type Filter = "all" | "review" | "deadline";

export function ResearchTeamWorkbench({
  onPlan,
  refresh,
  selectedTask,
  onSelectTask,
  layout,
  detailOpen,
}: {
  onPlan: () => void;
  refresh?: number;
  selectedTask?: string;
  onSelectTask: (id?: string, detail?: boolean) => void;
  layout: "list" | "week";
  detailOpen: boolean;
}) {
  const actor = useResearchStore((s) => s.actor),
    generation = useResearchStore((s) => s.generation);
  const laboratory = actor?.spaceKind === "laboratory";
  const [scope, setScope] = useState<"lab" | "mine">("lab");
  const [filter, setFilter] = useState<Filter>("all");
  const [stage, setStage] = useState("all");
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<string>();
  const [page, setPage] = useState(1);
  const [membersOpen, setMembersOpen] = useState(false);
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const read = useResearchRead(
    (signal) =>
      collectTeamWorkspace(
        (query, signal) =>
          researchApi("researchWorkspace", {
            params: { id: actor!.member.labId },
            query: { scope, ...query },
            signal,
          }),
        signal,
      ),
    `team-progress:${actor?.member.labId}:${scope}`,
    laboratory,
    { timeoutMs: 10000, keepDataOnError: transientReadFailure },
  );
  const members = useResearchRead(
    (signal) =>
      researchApi("members", {
        params: { id: actor!.member.labId },
        query: { limit: 100 },
        signal,
      }),
    `team-progress-members:${actor?.member.labId}`,
    laboratory,
    { timeoutMs: 10000 },
  );
  useEffect(() => {
    if (refresh) void read.refresh();
  }, [refresh, read.refresh]);
  useLayoutEffect(() => {
    setScope("lab");
    setFilter("all");
    setStage("all");
    setSearch("");
    setDirection(undefined);
    setPage(1);
    setMembersOpen(false);
    setClosed(new Set());
    setFiltersOpen(false);
  }, [generation]);
  const people = new Map(members.data?.data.map((m) => [m.id, m.displayName]));
  if (actor) people.set(actor.member.id, actor.member.displayName);
  const name = (id: string | null) =>
    id ? people.get(id) || "成员姓名待读取" : "未指定成员";
  const rows = read.data?.data || [];
  const directions = useMemo(() => teamDirections(rows), [read.data]);
  const assignments = useMemo(() => {
    const counts = new Map<
      string,
      { working: number; review: number; invited: number }
    >();
    const add = (
      id: string | null | undefined,
      key: "working" | "review" | "invited",
    ) => {
      if (!id) return;
      const count = counts.get(id) || { working: 0, review: 0, invited: 0 };
      count[key]++;
      counts.set(id, count);
    };
    for (const row of rows) {
      const status = teamTaskStatus(row.task);
      if (["completed", "cancelled"].includes(status)) continue;
      add(row.acceptedAssignment?.memberId, "working");
      if (isFullTask(row.task) && status === "in_review")
        add(row.task.reviewerId, "review");
      add(
        row.pendingInvitation?.memberId ||
          (!isFullTask(row.task) && row.task.pendingInvitation
            ? actor?.member.id
            : undefined),
        "invited",
      );
    }
    return counts;
  }, [read.data, actor?.member.id]);
  const query = search.trim().toLocaleLowerCase();
  const visible = directions.flatMap((group) => {
    if (direction && direction !== group.id) return [];
    if (stage !== "all" && stage !== group.stage) return [];
    const matches = group.rows.filter((row) => {
      const status = teamTaskStatus(row.task),
        deadline = teamDeadline(row.task);
      return (
        (filter === "all" ||
          (filter === "review" && status === "in_review") ||
          (filter === "deadline" && (row.overdue || deadline.soon))) &&
        (!query ||
          [
            group.title,
            row.task.title,
            isFullTask(row.task) ? row.task.goal : row.task.summary,
            row.latestDeliverable?.summary || "",
          ]
            .join(" ")
            .toLocaleLowerCase()
            .includes(query))
      );
    });
    return matches.length ? [{ ...group, matches }] : [];
  });
  const pageCount = Math.max(1, Math.ceil(visible.length / 8)),
    currentPage = Math.min(page, pageCount);
  if (!actor) return <p role="status">正在确认课题组身份…</p>;
  if (!laboratory)
    return (
      <div className="workspace-empty">
        <h2>你还没有加入课题组</h2>
        <p>加入后，在这里查看课题组的任务、分工和成果进度。</p>
        <ResearchTeamAccountHint />
      </div>
    );
  const selectedRow = rows.find((row) => row.task.id === selectedTask);
  const detail = selectedTask && (
    <WorkspaceTaskDetail
      key={`${generation}:research:${selectedTask}`}
      taskId={selectedTask}
      kind="research"
      reviewContext={selectedRow?.planGoal || "团队任务"}
      memberNames={people}
      onChanged={async () => {
        read.invalidate();
        await read.refresh();
      }}
    />
  );
  const notices = (
    <>
      <TaskReadNotice error={read.error} stale={!!read.data} loading={read.loading} onRetry={read.refresh} />
      {!read.data && !read.error && (
        <p className="workspace-task-list-note" role="status">正在读取课题组任务…</p>
      )}
      {read.data?.truncated && (
        <Alert type="warning"
          message={`当前仅读取 ${rows.length} / ${read.data.summary.total} 项，进度仅统计已读取任务。`} />
      )}
      {members.error && <Alert type="warning" message="成员姓名暂不可用" action={<Button onClick={members.refresh}>重试</Button>} />}
    </>
  );
  const empty = read.data && !visible.length && (
    <div className="workspace-task-list-note">
      <p>{rows.length ? "没有符合当前筛选的任务。" : scope === "mine" ? "还没有你参与的课题组任务。" : "还没有课题组任务。"}</p>
      {!rows.length && (
        <Button onClick={scope === "mine" ? () => setScope("lab") : onPlan}>
          {scope === "mine" ? "查看课题组可见任务" : "新建课题组任务"}
        </Button>
      )}
    </div>
  );
  const toolbar = (
    <div className="blue-team-tools">
      <Button type="text" icon={<FilterOutlined />} aria-expanded={filtersOpen}
        onClick={() => setFiltersOpen(!filtersOpen)}>筛选{scope === "mine" || stage !== "all" || direction || filter !== "all" || query ? "（已启用）" : ""}</Button>
      <Button type="text" loading={read.loading} onClick={() => void read.refresh()}>刷新</Button>
      {read.data && <Button type="text" onClick={() => setMembersOpen(true)}>成员分工</Button>}
      <time dateTime={taskDate(new Date())}>{taskDate(new Date())}</time>
    </div>
  );
  const filters = filtersOpen && (
    <div className="blue-team-filters">
      <Segmented aria-label="科研任务范围" value={scope}
        options={[{ label: "课题组可见", value: "lab" }, { label: "我参与的", value: "mine" }]}
        onChange={(value) => {
          setScope(value as typeof scope);
          setDirection(undefined);
          setPage(1);
          onSelectTask();
        }} />
      <Input aria-label="查找课题组任务" placeholder="搜索目标、任务或成果" value={search} allowClear
        onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
      <Select aria-label="计划阶段" value={stage}
        options={[
          { value: "all", label: "全部阶段" },
          { value: "active", label: "正在推进" },
          { value: "planned", label: "准备开展" },
          { value: "closed", label: "已结束" },
        ]}
        onChange={(value) => { setStage(value); setPage(1); }} />
      <Select aria-label="按计划筛选" placeholder="全部计划" value={direction} allowClear
        onChange={(value) => { setDirection(value); setPage(1); }}
        options={directions.map((group) => ({ value: group.id, label: group.title }))} />
      <Segmented aria-label="进度筛选" value={filter}
        options={[{ label: "全部", value: "all" }, { label: "待验收", value: "review" }, { label: "临近截止", value: "deadline" }]}
        onChange={(value) => { setFilter(value as Filter); setPage(1); }} />
    </div>
  );
  const groups = visible.slice((currentPage - 1) * 8, currentPage * 8);
  return (
    <>
      {layout === "week" ? (
        <TaskWorkspace weekly list={
          <>
            {toolbar}{filters}
            <TaskWeekSchedule onClearSelection={() => onSelectTask()} items={visible.flatMap((group) => group.matches.map((row) => ({
              id: row.task.id,
              title: row.task.title,
              note: isFullTask(row.task) ? row.task.goal : row.task.summary,
              when: taskSchedule(row.task.schedule),
              selected: selectedTask === row.task.id,
              onSelect: () => onSelectTask(row.task.id),
            })))} notices={notices} />
          </>
        }>
          {detail || <div className="workspace-empty"><h2>选择一项团队任务</h2></div>}
        </TaskWorkspace>
      ) : (
        <section className="blue-team-list" aria-label="课题组任务列表">
          {toolbar}{filters}{notices}
          {visible.length > 0 && (
            <div className="blue-team-columns blue-team-column-labels" aria-hidden>
              <span>任务</span><span>负责人</span><span>状态</span><span>截止日期</span>
            </div>
          )}
          {groups.map((group) => {
            const open = !closed.has(group.id);
            return (
              <section className="blue-team-project" key={group.id} aria-label={group.title}>
                <h2>
                  <button type="button" aria-expanded={open} aria-label={group.title}
                    title={group.title} onClick={() => setClosed((previous) => {
                      const next = new Set(previous);
                      if (open) next.add(group.id);
                      else next.delete(group.id);
                      return next;
                    })}>
                    {open ? <DownOutlined aria-hidden /> : <RightOutlined aria-hidden />}
                    <strong>{group.title}</strong>
                    {group.progressVisible && group.total > 0 && (
                      <span className="blue-team-progress">
                        <span>{read.data?.truncated && "已读取 · "}已完成 {group.accepted}/{group.total}</span>
                        <progress max={group.total} value={group.accepted} aria-label={`${group.title}验收进度`} />
                      </span>
                    )}
                  </button>
                </h2>
                {open && group.matches.map((row) => {
                  const task = row.task;
                  const status = teamTaskStatus(task);
                  const deadline = taskDeadline(task.schedule);
                  const dateNote = teamDeadline(task).label;
                  const expanded = selectedTask === task.id;
                  const assignee = row.acceptedAssignment?.memberId || row.pendingInvitation?.memberId ||
                    (isFullTask(task) ? task.leadId : null);
                  const delivery = row.latestDeliverable;
                  const textPreview = delivery && !delivery.sources.length
                    ? deliveryDisplaySummary(delivery.summary).trim().split(/\r?\n/, 1)[0]
                        .replace(/^#{1,6}\s+/, "")
                    : "";
                  const canReview = isFullTask(task) && status === "in_review" &&
                    task.allowedActions.includes("review") && delivery && !delivery.review;
                  const statusText = task.allowedActions.includes("claim") ? "待认领" : ({
                    ready: "待开始",
                    in_review: "待验收",
                    changes_requested: "待修改",
                  } as Record<string, string>)[status] || workspaceStatusLabel[status] || status;
                  return (
                    <div className="blue-team-task" key={task.id}>
                      <button type="button" className="blue-team-columns blue-team-task-row" aria-expanded={expanded}
                        onClick={() => onSelectTask(expanded ? undefined : task.id)}>
                        <span>
                          {expanded ? <DownOutlined aria-hidden /> : <RightOutlined aria-hidden />}
                          <strong>{task.title}</strong>
                        </span>
                        <span>{name(assignee)}</span>
                        <span data-status={status}>{statusText}</span>
                        <span title={dateNote}>{deadline ? <time dateTime={deadline}>{deadline}</time> : "—"}</span>
                      </button>
                      {expanded && (
                        <div className="blue-team-task-preview">
                          {delivery ? (
                            <>
                              <p>{name(delivery.submittedBy)}提交了第 {delivery.revision} 版。</p>
                              {textPreview && <p className="blue-team-preview-text">{textPreview}</p>}
                              {delivery.review && <p className="blue-team-feedback">审阅意见：{delivery.review.comment}</p>}
                              <div className="blue-team-preview-actions">
                                {delivery.sources.map((source, index) => (
                                  <TaskDeliveryDownload key={`${source.locator}:${index}`}
                                    target={{ kind: "research", taskId: task.id }} locator={source.locator}
                                    label={source.label} appearance="link" />
                                ))}
                                <Button type="link" onClick={() => onSelectTask(task.id, true)}>
                                  {canReview ? `审阅第 ${delivery.revision} 版` : "查看交付"}
                                </Button>
                              </div>
                            </>
                          ) : (
                            <>
                              <p>{teamNextStep(task, actor.member.id)}</p>
                              <Button type="link" onClick={() => onSelectTask(task.id, true)}>查看任务</Button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            );
          })}
          {empty}
          {pageCount > 1 && (
            <div className="workspace-pages">
              <span>第 {currentPage}/{pageCount} 页</span>
              <Button size="small" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>上一页</Button>
              <Button size="small" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>下一页</Button>
            </div>
          )}
        </section>
      )}
      {layout === "list" && (
        <Drawer title={selectedRow?.task.title || "团队任务"} open={detailOpen && !!selectedTask}
          width="min(780px, 100vw)" onClose={() => onSelectTask(selectedTask)} destroyOnClose
          rootClassName="blue-team-detail-drawer" bodyStyle={{ padding: 0 }}>
          {detailOpen && detail}
        </Drawer>
      )}
      <Drawer title="成员分工" open={membersOpen} width={420} onClose={() => setMembersOpen(false)}>
        {read.data?.truncated && <Alert type="warning" message="当前仅统计已读取的任务。" />}
        {members.error && <Alert type="warning" message="成员姓名暂不可用，可刷新后查看。" />}
        {Array.from(assignments, ([id, count]) => (
          <section className="workspace-task-member" key={id}>
            <strong>{name(id)}</strong>
            <p>已承接 {count.working} 项 · 待审阅 {count.review} 项 · 邀请待接受 {count.invited} 项</p>
          </section>
        ))}
        {!assignments.size && <p>当前没有已承接、待审阅或待接受的分工。</p>}
      </Drawer>
    </>
  );
}
