import { Alert, Button, Dropdown, Input, Modal, Segmented, Select } from "antd";
import { CalendarOutlined, DownOutlined, FileTextOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import type { PersonalFollowup, WorkbenchCard } from "@research-agent-platform/contracts";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";
import { usePersonalOperation } from "./usePersonalOperation";
import { researchApi } from "./api";
import { useWorkspaceConversation } from "./workspace-api";
import { workspaceMemberLabel, workspaceStatusLabel } from "./workspace-labels";
import {
  TaskWorkspace,
  TaskReadNotice,
  WorkspaceTaskDetail,
} from "./TaskWorkspace";
import { transientReadFailure } from "./read-errors";
import { collectTaskInbox, workbenchNextAction } from "./task-inbox";
import { collectTeamWorkspace } from "./team-progress";
import SafeMessageMarkdown from "./SafeMessageMarkdown";
import "./workspace.scss";
import "./blue-task-page.scss";
import { TaskWeekSchedule, taskDateTime, taskSchedule } from "./TaskWeekSchedule";
import { PersonalAssistantPanel } from "./PersonalAssistantPanel";
import { useWorkspaceAvailability } from "./useWorkspaceAvailability";
import { WorkspaceUnavailable } from "./WorkspaceUnavailable";

import { ResearchTeamWorkbench } from "./ResearchTeamWorkbench";
import { relocatedWorkspace } from "./workspace-navigation";
import { PlanningHistory } from "./PlanningHistory";
import { workbenchTaskPath, workbenchTaskTarget } from "./workbench-links";
import { workbenchView, personalTaskTitle, type WorkbenchTab } from "./workbench-view";
import { PlanningAgent } from "./PlanningAgent";
function WorkbenchOverview({ card }: { card: WorkbenchCard }) {
  const operation = usePersonalOperation(true, `workspace-overview:${card.id}`),
    openConversation = useWorkspaceConversation();
  const [failure, setFailure] = useState<{ scope: string; message: string }>();
  return (
    <section className="workspace-task-detail" aria-label="任务概览">
      <header>
        <span className="workspace-eyebrow">
          {card.source === "research_task"
            ? "科研协作"
            : card.source === "followup"
            ? "定时安排"
            : "个人协作"}
        </span>
        <h2>{card.title}</h2>
        <span className="workspace-status">
          {(card.result?.changesRequested ? "待修改" : workspaceStatusLabel[card.status]) || card.progress.label || "查看状态"}
        </span>
      </header>
      <div className="workspace-task-goal">
        {card.goal ? (
          <SafeMessageMarkdown text={card.goal} />
        ) : (
          <p className="workspace-muted">
            当前只获准查看任务摘要，接受邀请后可查看具体目标。
          </p>
        )}
      </div>
      <h3>负责人和成员</h3>
      <div className="workspace-member-list">
        <p>
          <strong>{card.owner.displayName}</strong>
          <span className="workspace-kind">负责人</span>
        </p>
        {card.participants
          .filter((p) => p.contactId !== card.owner.contactId)
          .map((p) => (
            <p key={p.contactId}>
              {p.displayName}
              <span
                className={`workspace-kind ${p.kind === "agent" ? "agent" : "human"}`}
              >
                {p.kind === "agent" ? "Agent" : "个人"}
              </span>
              <small>{workspaceMemberLabel[p.status]}</small>
            </p>
          ))}
      </div>
      <section className="workspace-task-progress">
        <h3>进展</h3>
        <p>
          {workspaceStatusLabel[card.progress.label] ||
            card.progress.label ||
            "当前进展尚未提供"}
        </p>
        {card.progress.total > 0 && (
          <p className="workspace-muted">
            已完成 {card.progress.completed} / {card.progress.total} 项
          </p>
        )}
      </section>
      {card.result && (
        <section className="workspace-result">
          <h3>{card.result.accepted ? "已验收结果" : "当前结果 · 待核对"}</h3>
          <SafeMessageMarkdown text={card.result.summary} />
        </section>
      )}
      {failure?.scope === operation.scope && (
        <Alert type="warning" message={failure.message} />
      )}
      <div className="workspace-card-actions">
        {card.conversationId && !card.summaryOnly && (
          <Button
            onClick={async () => {
              const { isCurrent } = operation.capture();
              try {
                await openConversation(card.conversationId!, isCurrent);
              } catch (e) {
                if (isCurrent())
                  setFailure({
                    scope: operation.scope,
                    message: e instanceof Error ? e.message : "聊天暂不可用。",
                  });
              }
            }}
          >
            返回聊天
          </Button>
        )}
      </div>
    </section>
  );
}

export function DesktopWorkbench() {
  const [params, setParams] = useSearchParams();
  const relocated = relocatedWorkspace(params);
  // Saved planning links still open the assistant; history itself is a full page.
  const { tab, layout, planning, planId, requestId, draft, filter } = workbenchView(params);
  const [planningLaunch, setPlanningLaunch] = useState(0);
  const [taskLaunch, setTaskLaunch] = useState(0);
  const [planningExpanded, setPlanningExpanded] = useState(false);
  const [workbenchRevision, setWorkbenchRevision] = useState(0);
  const {
    id: requestedTask,
    kind: requestedKind,
    valid: requestedValid,
  } = workbenchTaskTarget(params);
  const [taskSearch, setTaskSearch] = useState("");
  const [taskSort, setTaskSort] = useState<"recent" | "oldest" | "title">("recent");
  const [reminderId, setReminderId] = useState<string>();
  const [remindersOpen, setRemindersOpen] = useState(false);
  const generation = useResearchStore((s) => s.generation),
    actor = useResearchStore((s) => s.actor),
    contacts = useResearchStore((s) => s.contacts);
  const availability = useWorkspaceAvailability(!relocated);
  const supported = availability.supports(21);
  const read = useResearchRead(
    (signal) =>
      collectTaskInbox(
        (cursor, signal) =>
          researchApi("workbench", {
            query: { category: filter, cursor, limit: 100 },
            signal,
          }),
        actor?.spaceKind === "laboratory" && availability.supports(23)
          ? (signal) =>
              collectTeamWorkspace(
                (query, signal) =>
                  researchApi("researchWorkspace", {
                    params: { id: actor.member.labId },
                    query: { scope: "mine", ...query },
                    signal,
                  }),
                signal,
              )
          : undefined,
        signal,
      ),
    `workbench:${filter}:${actor?.member.labId}:${availability.supports(23)}`,
    tab === "tasks" && supported && !!actor,
    { timeoutMs: 10000, keepDataOnError: transientReadFailure },
  );
  const members = useResearchRead(
    (signal) => researchApi("members", {
      params: { id: actor!.member.labId },
      query: { limit: 100 },
      signal,
    }),
    `inbox-members:${actor?.member.labId}`,
    tab === "tasks" && supported && actor?.spaceKind === "laboratory",
    { poll: false },
  );
  const reminders = useResearchRead(
    async (signal) => {
      const data: PersonalFollowup[] = [];
      const seen = new Set<string>();
      let cursor: string | undefined;
      do {
        const result = await researchApi("personalFollowups", {
          query: { status: "all", limit: 100, cursor },
          signal,
        });
        data.push(...result.data);
        cursor = result.nextCursor || undefined;
        if (!cursor) return { data, truncated: false };
        if (seen.has(cursor)) throw new Error("提醒分页重复，请重新读取。");
        seen.add(cursor);
      } while (seen.size < 10);
      return { data, truncated: true };
    },
    "inbox-week-reminders",
    tab === "tasks" && layout === "week" && !!actor && supported,
    { timeoutMs: 10000, keepDataOnError: transientReadFailure },
  );
  const [selected, setSelected] = useState<WorkbenchCard>();
  const [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  // A personal task needs one sentence, not a form: the name comes from it and
  // an Agent is chosen later in the task itself.
  const [form, setForm] = useState({ goal: "", contactIds: [] as string[] });
  const operation = usePersonalOperation(
      !!creating && supported,
      "create-workspace-task",
    ),
    inFlight = useRef(false);
  useLayoutEffect(() => {
    if (!supported) setCreating(false);
  }, [supported]);
  useLayoutEffect(() => {
    setSelected(undefined);
    setCreating(false);
    setTaskSearch("");
    setTaskSort("recent");
    setReminderId(undefined);
    setRemindersOpen(false);
    setFailure("");
    setBusy(false);
    inFlight.current = false;
    setForm({ goal: "", contactIds: [] });
  }, [generation]);
  const query = taskSearch.trim().toLocaleLowerCase();
  const cards = (read.data?.data || [])
    .filter((card) => (filter === "completed" || card.category !== "completed") &&
      (!query || [card.title, card.goal, card.owner.displayName, ...card.participants.map((person) => person.displayName)]
        .join(" ").toLocaleLowerCase().includes(query)))
    .sort((a, b) => taskSort === "title" ? a.title.localeCompare(b.title, "zh-CN") :
      taskSort === "oldest" ? Date.parse(a.updatedAt) - Date.parse(b.updatedAt) :
      Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const review = (card: WorkbenchCard) =>
    !card.summaryOnly && card.allowedActions.includes("review") &&
    !!card.result && !card.result.accepted && !card.result.changesRequested;
  const groups = [
    { key: "review", label: "待我验收", items: cards.filter(review) },
    { key: "follow", label: "跟进中", items: cards.filter((card) =>
        !review(card) && ["ongoing", "awaiting_me"].includes(card.category)) },
    { key: "scheduled", label: "定时安排", items: cards.filter((card) => card.category === "scheduled") },
    { key: "completed", label: "已完成", items: cards.filter((card) => card.category === "completed") },
  ];
  const memberNames = new Map(members.data?.data.map((member) => [member.id, member.displayName]));
  for (const { contact } of contacts) {
    const identity = contact.identity;
    if (identity.kind === "human" && !memberNames.has(identity.memberId))
      memberNames.set(identity.memberId, contact.displayName);
  }
  if (actor) memberNames.set(actor.member.id, actor.member.displayName);
  const researchRow = (card: WorkbenchCard) =>
    card.source === "research_task" && card.taskId ? read.data?.researchRows.get(card.taskId) : undefined;
  const selectedReminder = reminders.data?.data.find((item) => item.id === reminderId);
  const matches = (card: WorkbenchCard) => requestedTask
    ? card.taskId === requestedTask && (card.source === "research_task" ? "research" : "personal") === requestedKind
    : selected?.id === card.id && selected.source === card.source;
  const activeCard =
    selected &&
    cards.find(
      (card) => card.id === selected.id && card.source === selected.source,
    );
  const eligible = contacts
    .map((e) => e.contact)
    .filter(
      (c) =>
        c.allowedActions.includes("chat") &&
        !(c.identity.kind === "human" && c.identity.memberId === actor?.member.id),
    );
  const setTab = (value: WorkbenchTab) => {
    setPlanningLaunch(0);
    setSelected(undefined);
    setReminderId(undefined);
    setTaskSearch("");
    setParams(new URLSearchParams({
      view: value,
      ...(layout === "week" ? { layout } : {}),
      ...(value === "history" ? { returnTo: tab === "team" ? "team" : "tasks" } : {}),
    }));
  };
  const setLayout = (layout: string) => {
    setTaskSearch("");
    const next = new URLSearchParams(params);
    if (layout === "week") next.set("layout", "week");
    else next.delete("layout");
    next.delete("detail");
    setParams(next);
  };
  // A saved plan or planning link is a request to keep working on it, so the
  // assistant opens with that thread instead of a separate page being shown.
  useEffect(() => {
    if (planning) setPlanningLaunch((value) => value + 1);
  }, [planning, planId, requestId]);
  const select = (card: WorkbenchCard, replace = false) => {
    setReminderId(undefined);
    const next = new URLSearchParams(params);
    next.delete("plan");
    next.delete("planning");
    next.delete("draft");
    next.delete("delivery");
    if (card.taskId && card.source !== "followup") {
      setSelected(undefined);
      next.set("view", "tasks");
      next.set("task", card.taskId);
      next.set("taskKind", card.source === "research_task" ? "research" : "personal");
    } else {
      setSelected(card);
      next.delete("task");
      next.delete("taskKind");
    }
    setParams(next, { replace });
  };
  const firstReview = groups[0].items[0];
  useEffect(() => {
    if (tab === "tasks" && layout === "list" && !requestedTask && !selected && !planning && !planningLaunch && firstReview)
      select(firstReview, true);
  }, [tab, layout, requestedTask, selected?.id, planning, planningLaunch, firstReview?.taskId]);

  const create = async () => {
    if (!supported || inFlight.current || !form.goal.trim()) return;
    const { isCurrent } = operation.capture();
    inFlight.current = true;
    setBusy(true);
    setFailure("");
    try {
      const goal = form.goal.trim();
      const created = await researchApi("createPersonalWorkTask", {
        body: {
          title: personalTaskTitle(goal),
          goal,
          contactIds: form.contactIds,
          agentContactId: null,
        },
      });
      if (!isCurrent()) return;
      setCreating(false);
      setForm({ goal: "", contactIds: [] });
      const next = new URLSearchParams(
        workbenchTaskPath(created.data.id).split("?")[1],
      );
      if (layout === "week") next.set("layout", "week");
      setParams(next);
      await read.refresh();
    } catch (e) {
      if (isCurrent())
        setFailure(e instanceof Error ? e.message : "任务草案未保存，填写内容已保留。");
    } finally {
      if (isCurrent()) setBusy(false);
      inFlight.current = false;
    }
  };
  if (relocated) return <Navigate to={relocated} replace />;
  const assistantBar = !!actor && tab !== "history";
  // The assistant writes the task; the old form survives only where it cannot run.
  const assistantReady =
    Boolean(actor) &&
    supported &&
    availability.supports(23) &&
    availability.supports(32);
  const startTask = () => {
    if (!assistantReady) return;
    // Drop any plan link so the assistant opens a fresh thread, not the last one.
    if (requestedTask || planId || requestId || params.get("view") === "planning")
      setParams(new URLSearchParams({ view: tab, ...(layout === "week" ? { layout } : {}) }));
    setTaskLaunch((value) => value + 1);
    setPlanningLaunch((value) => value + 1);
  };
  // Personal tasks have no group and no materials: one sentence and, at most,
  // the people who should see it.
  const startPersonalTask = () => {
    setCreating(true);
    setFailure("");
    setBusy(false);
  };
  return (
    <div
      className={`social-workspace workspace-workbench blue-task-page ${
        planningExpanded && assistantBar ? "is-planning-expanded" : ""
      }`}
    >
      <header className="workspace-heading">
        <h1>任务</h1>
        <div className="workspace-heading-actions">
          {tab === "history" ? <strong>计划记录</strong> : <Segmented
            className="blue-task-scope-control"
            aria-label="任务视图"
            value={tab}
            onChange={(value) => setTab(value as WorkbenchTab)}
            options={[
              { label: "我的待办", value: "tasks" },
              { label: "团队任务", value: "team" },
            ]}
          />}
          {tab !== "history" && (
            <>
            <Segmented
              className="blue-task-layout-control"
              aria-label="任务布局"
              value={layout}
              onChange={(value) => setLayout(String(value))}
              options={[{ label: "列表", value: "list" }, { label: "周安排", value: "week" }]}
            />
            <Dropdown
              trigger={["click"]}
              menu={{
                items: [
                  { key: "personal", label: "新建个人任务", disabled: !supported },
                  {
                    key: "research",
                    label: <span title={assistantReady ? undefined : "这台服务器还没有任务助手，暂时只能建个人任务"}>新建课题组任务</span>,
                    disabled: !assistantReady,
                  },
                  { type: "divider" },
                  { key: "resume-plan", label: "继续计划讨论", disabled: !assistantReady },
                  { key: "history", label: "计划记录" },
                ],
                onClick: ({ key }) => {
                  if (key === "history") setTab("history");
                  else if (key === "resume-plan") setPlanningLaunch((value) => value + 1);
                  else if (key === "personal") startPersonalTask();
                  else startTask();
                },
              }}
            >
              <Button type="primary" icon={<PlusOutlined />} disabled={!supported}>新建任务</Button>
            </Dropdown>
            </>
          )}
        </div>
      </header>
      <div className="workbench-content">
        {!supported ? (
          <WorkspaceUnavailable
            feature="工作台"
            pending={!availability.data && !availability.error}
            error={availability.error}
            onRetry={availability.refresh}
          />
        ) : tab === "history" ? (
          <PlanningHistory
            onBack={() => setTab(params.get("returnTo") === "team" ? "team" : "tasks")}
            onOpen={(target) => {
              if (target.task) {
                setParams(
                  new URLSearchParams(
                    workbenchTaskPath(target.task, "research").split("?")[1],
                  ),
                );
                return;
              }
              const next = new URLSearchParams({ view: "tasks" });
              if (target.plan) next.set("plan", target.plan);
              if (target.request) next.set("planning", target.request);
              setParams(next);
            }}
          />
        ) : tab === "team" ? (
          availability.supports(23) ? (
            <ResearchTeamWorkbench
              refresh={workbenchRevision}
              onPlan={startTask}
              layout={layout}
              detailOpen={params.get("detail") === "1"}
              selectedTask={
                requestedKind === "research" && requestedValid
                  ? requestedTask || undefined
                  : undefined
              }
              onSelectTask={(id, details) => {
                const next = new URLSearchParams(params);
                if (id) {
                  next.set("task", id);
                  next.set("taskKind", "research");
                } else {
                  next.delete("task");
                  next.delete("taskKind");
                }
                if (details) next.set("detail", "1");
                else next.delete("detail");
                setParams(next);
              }}
            />
          ) : (
            <section className="workspace-empty workspace-unavailable" role="status">
              <h2>科研团队服务待升级</h2>
              <p>
                科研团队总览需要服务器契约 0.23
                或以上。已有任务、计划与聊天可以继续访问。
              </p>
              <div className="workspace-card-actions">
                <Button onClick={availability.refresh}>重新检查</Button>
                <Button type="primary" onClick={() => setTab("tasks")}>
                  查看已有任务
                </Button>
              </div>
            </section>
          )
        ) : (
          <TaskWorkspace
            weekly={layout === "week"}
            list={layout === "week" ? (
              <TaskWeekSchedule
                onClearSelection={() => {
                  const next = new URLSearchParams(params);
                  next.delete("task");
                  next.delete("taskKind");
                  next.delete("delivery");
                  setSelected(undefined);
                  setReminderId(undefined);
                  setParams(next, { replace: true });
                }}
                items={[
                  ...cards.filter((card) => card.source !== "followup" || !reminders.data)
                    .map((card) => ({
                      id: card.id,
                      title: card.title,
                      note: card.goal,
                      when: taskSchedule(researchRow(card)?.task.schedule),
                      selected: matches(card),
                      onSelect: () => select(card),
                    })),
                  ...(reminders.data?.data || [])
                    .filter((item) => filter === "completed" ? item.status === "completed" :
                      item.status === "active" || item.status === "paused")
                    .map((item) => ({
                      id: `reminder:${item.id}`,
                      title: item.title,
                      note: item.body,
                      when: item.status === "paused" ? undefined : {
                        kind: "instant" as const,
                        at: item.status === "active" ? item.nextDeliveryAt : item.lastRun?.scheduledAt || item.dueAt,
                      },
                      selected: item.id === reminderId && !requestedTask,
                      onSelect: () => {
                        const next = new URLSearchParams(params);
                        next.delete("task");
                        next.delete("taskKind");
                        setParams(next);
                        setSelected(undefined);
                        setReminderId(item.id);
                      },
                    })),
                ]}
                notices={<>
                  <TaskReadNotice error={read.error} stale={!!read.data} loading={read.loading} onRetry={read.refresh} />
                  {reminders.error && <Alert type="warning" message="暂时无法读取定时安排" description={reminders.error}
                    action={<Button size="small" onClick={() => void reminders.refresh()}>重试</Button>} />}
                  {(read.data?.truncated || reminders.data?.truncated) && <Alert type="warning" message="周安排计数仅包含已读取的事项。" />}
                </>}
              />
            ) : (
              <>
                <div className="blue-task-list-tools">
                  <Input
                    aria-label="查找我的任务"
                    placeholder="搜索任务"
                    suffix={<SearchOutlined aria-hidden />}
                    allowClear
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                  />
                  <Dropdown
                    trigger={["click"]}
                    menu={{
                      selectedKeys: [taskSort],
                      items: [
                        { key: "recent", label: "按更新时间" },
                        { key: "oldest", label: "最早更新优先" },
                        { key: "title", label: "按任务名称" },
                        { type: "divider" },
                        { key: "refresh", label: "刷新" },
                      ],
                      onClick: ({ key }) => {
                        if (key === "refresh") void read.refresh();
                        else setTaskSort(key as typeof taskSort);
                      },
                    }}
                  >
                    <Button type="text" aria-label="任务排序" loading={read.loading}>
                      {{ recent: "按更新时间", oldest: "最早更新优先", title: "按任务名称" }[taskSort]} <DownOutlined />
                    </Button>
                  </Dropdown>
                </div>
                {read.data?.truncated && <Alert type="warning" message="当前仅显示已读取的任务。" />}
                <TaskReadNotice error={read.error} stale={!!read.data} loading={read.loading} onRetry={read.refresh} />
                {!read.data && !read.error && <p className="workspace-task-list-note" role="status">正在读取任务…</p>}
                {groups.filter((group) => group.items.length).map((group) => (
                  <details key={group.key} className="blue-task-inbox-group" open>
                    <summary>
                      {group.label}{!read.data?.truncated && `（${group.items.length}）`}
                    </summary>
                    {group.items.map((card) => {
                      const row = researchRow(card);
                      const delivery = row?.latestDeliverable;
                      const name = delivery
                        ? memberNames.get(delivery.submittedBy) || "提交人姓名待读取"
                        : memberNames.get(row?.acceptedAssignment?.memberId || "") ||
                          card.participants.find((person) => person.kind === "human" && person.status === "accepted")?.displayName ||
                          card.owner.displayName;
                      const date = card.updatedAt;
                      return (
                        <button type="button" key={card.id} className="blue-task-inbox-row" aria-pressed={matches(card)}
                          title={workbenchNextAction(card)} onClick={() => select(card)}>
                          {card.source === "followup" ? <CalendarOutlined aria-hidden /> : <FileTextOutlined aria-hidden />}
                          <span className="blue-task-inbox-copy">
                            <strong>{card.title}</strong>
                            <small>{name}{delivery ? ` · 第 ${delivery.revision} 版` : ""}
                              {(card.status === "changes_requested" || card.result?.changesRequested) &&
                                <span className="blue-task-needs-revision"> · 待修改</span>}
                            </small>
                          </span>
                          <time dateTime={date}>{taskDateTime(date)}</time>
                        </button>
                      );
                    })}
                  </details>
                ))}
                {read.data && !cards.length && <p className="workspace-task-list-note">
                  {query ? "没有符合搜索条件的任务。" : filter === "completed" ? "还没有已完成的任务。" : "暂时没有要推进的任务。"}
                </p>}
                {read.data && (
                  <Button type="link" size="small" onClick={() => {
                    setParams(filter === "completed" ? { view: "tasks" } : { view: "tasks", category: "completed" });
                    setTaskSearch("");
                    setSelected(undefined);
                  }}>
                    {filter === "completed" ? "返回待办" : "查看已完成"}
                  </Button>
                )}
              </>
            )}
          >
            {requestedTask ? (
              requestedValid ? (
                <WorkspaceTaskDetail
                  key={`${generation}:${requestedKind}:${requestedTask}`}
                  taskId={requestedTask}
                  kind={requestedKind === "research" ? "research" : "personal"}
                  reviewContext={
                    (requestedKind === "research" && read.data?.planGoals?.get(requestedTask)) ||
                    "我的待办"
                  }
                  memberNames={memberNames}
                  deliveryOpen={params.get("delivery") === "1"}
                  onChanged={async () => {
                    read.invalidate();
                    await read.refresh();
                  }}
                />
              ) : (
                <Alert type="warning" message="任务链接无效，请从列表重新选择。" />
              )
            ) : activeCard ? (
              <WorkbenchOverview
                key={`${activeCard.source}:${activeCard.id}`}
                card={activeCard}
              />
            ) : layout === "week" && selectedReminder ? (
              <section className="workspace-task-detail" aria-label="定时安排详情">
                <header><h2>{selectedReminder.title}</h2></header>
                <p className="workspace-muted">{selectedReminder.status === "paused" ? "已暂停" : taskDateTime(
                  selectedReminder.status === "active" ? selectedReminder.nextDeliveryAt :
                    selectedReminder.lastRun?.scheduledAt || selectedReminder.dueAt,
                )}</p>
                <SafeMessageMarkdown text={selectedReminder.body} />
                <Button onClick={() => setRemindersOpen(true)}>管理任务与提醒</Button>
              </section>
            ) : read.data ? (
              <div className="workspace-empty"><h2>选择一项任务</h2></div>
            ) : null}
          </TaskWorkspace>
        )}
      </div>
      {!!actor && (
        <PlanningAgent
          view={tab}
          hidden={tab === "history" || (!planning && !planningExpanded && !planningLaunch)}
          available={supported && availability.supports(23)}
          conversationAvailable={availability.supports(32)}
          focus={planningLaunch}
          fresh={taskLaunch}
          onExpandedChange={setPlanningExpanded}
          planId={planId}
          requestId={requestId}
          draft={draft}
          onCreated={() => {
            setWorkbenchRevision((value) => value + 1);
            void read.refresh();
          }}
          onTeam={() => setTab("team")}
        />
      )}
      {remindersOpen && <PersonalAssistantPanel open initialTab="followups" onClose={() => setRemindersOpen(false)} />}
      <Modal
        title="新建个人任务"
        open={creating}
        onCancel={() => setCreating(false)}
        footer={null}
        destroyOnClose
        className="workspace-add-dialog"
      >
        <div className="workspace-task-form">
          <label>
            要做什么
            <Input.TextArea
              aria-label="任务目标"
              rows={3}
              maxLength={8000}
              placeholder="一句话说清，比如：把上周的实验数据整理成一张表"
              value={form.goal}
              disabled={busy}
              onChange={(e) => setForm((s) => ({ ...s, goal: e.target.value }))}
            />
          </label>
          <label>
            一起参与的联系人（可留空）
            <Select
              aria-label="任务成员"
              mode="multiple"
              allowClear
              value={form.contactIds}
              disabled={busy}
              placeholder="只给自己做就不用选"
              options={eligible.map((c) => ({
                value: c.id,
                label: `${c.displayName}${
                  c.identity.kind === "human" ? "" : " · Agent"
                }`,
              }))}
              onChange={(contactIds) => setForm((s) => ({ ...s, contactIds }))}
            />
          </label>
          <p className="workspace-muted">
            只给自己或朋友安排：不建课题组群，也不占课题组资料；要请 Agent
            处理时在任务里选。
          </p>
          {failure && <Alert type="error" message={failure} />}
          <div className="workspace-task-form-actions">
            <Button disabled={busy} onClick={() => setCreating(false)}>取消</Button>
          <Button
            type="primary"
            loading={busy}
            disabled={!form.goal.trim()}
            onClick={() => void create()}
          >
            建好任务
          </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
