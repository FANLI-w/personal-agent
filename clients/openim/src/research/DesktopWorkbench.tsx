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
import { emptySchedule } from "./task-planning";
import { useOwnAssistantConversation } from "./useOwnAssistantConversation";
import { workbenchTaskPath, workbenchTaskTarget } from "./workbench-links";
import { workbenchView, personalTaskTitle, type WorkbenchTab } from "./workbench-view";

const emptyTaskForm = {
  goal: "",
  contactIds: [] as string[],
  deliverable: "",
  acceptanceCriteria: "",
  memberId: "",
};

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
  const { tab, layout, planId, requestId, filter } = workbenchView(params);
  const openPersonalAssistant = useOwnAssistantConversation();
  const [creating, setCreating] = useState<"personal" | "research">();
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
  const teamCreationAvailable = supported && availability.supports(23) &&
    actor?.spaceKind === "laboratory";
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
    (tab === "tasks" || creating === "research") &&
      supported && actor?.spaceKind === "laboratory",
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
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  const [form, setForm] = useState(emptyTaskForm);
  const operation = usePersonalOperation(
    !!creating && supported,
    `create-workspace-task:${creating}`,
  );
  const inFlight = useRef<symbol>();
  const attempt = useRef<{ fingerprint: string; key: string }>();
  useLayoutEffect(() => {
    if (!supported || (creating === "research" && !teamCreationAvailable))
      setCreating(undefined);
  }, [supported, creating, teamCreationAvailable]);
  useLayoutEffect(() => {
    setSelected(undefined);
    setCreating(undefined);
    setTaskSearch("");
    setTaskSort("recent");
    setReminderId(undefined);
    setRemindersOpen(false);
    setFailure("");
    setBusy(false);
    inFlight.current = undefined;
    attempt.current = undefined;
    setForm(emptyTaskForm);
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
    if (tab === "tasks" && layout === "list" && !requestedTask && !selected && !creating && firstReview)
      select(firstReview, true);
  }, [tab, layout, requestedTask, selected?.id, creating, firstReview?.taskId]);

  const canCreate = !!form.goal.trim() && (creating === "personal" ||
    (teamCreationAvailable && !!form.deliverable.trim() && !!form.acceptanceCriteria.trim()));
  const create = async () => {
    if (!actor || !creating || !supported || inFlight.current || !canCreate) return;
    const { isCurrent } = operation.capture();
    if (!isCurrent()) return;
    const ticket = Symbol();
    inFlight.current = ticket;
    setBusy(true);
    setFailure("");
    try {
      const goal = form.goal.trim();
      const title = personalTaskTitle(goal);
      const fingerprint = JSON.stringify([creating, actor.member.id, actor.member.labId, form]);
      if (attempt.current?.fingerprint !== fingerprint)
        attempt.current = { fingerprint, key: crypto.randomUUID() };
      const { key } = attempt.current;
      let taskId: string;
      if (creating === "research") {
        const { data: plan } = await researchApi("createPlan", {
          body: {
            labId: actor.member.labId,
            goal,
            unresolvedQuestions: [],
            proposedItems: [{
              id: key,
              title,
              goal,
              deliverable: form.deliverable.trim(),
              acceptanceCriteria: form.acceptanceCriteria.trim(),
              allocation: form.memberId
                ? { kind: "invitation", memberId: form.memberId }
                : { kind: "self" },
              dependencies: [],
              schedule: emptySchedule(),
              inputArtifactIds: [],
              budget: null,
              ...(availability.supports(35) ? { status: "可执行" as const } : {}),
            }],
          },
          idempotencyKey: key,
        });
        if (!isCurrent()) return;
        const confirmed = await researchApi("confirmPlan", {
          params: { id: plan.id },
          body: { expectedVersion: plan.version },
          idempotencyKey: `${key}_confirm`,
        });
        taskId = confirmed.data.taskIds[0];
        if (!taskId) throw new Error("计划已保存，任务暂不可读取。请在计划记录中查看。");
      } else {
        const created = await researchApi("createPersonalWorkTask", {
          body: { title, goal, contactIds: form.contactIds, agentContactId: null },
          idempotencyKey: key,
        });
        taskId = created.data.id;
      }
      if (!isCurrent()) return;
      setCreating(undefined);
      setForm(emptyTaskForm);
      attempt.current = undefined;
      const next = new URLSearchParams(
        workbenchTaskPath(taskId, creating === "research" ? "research" : "personal").split("?")[1],
      );
      if (layout === "week") next.set("layout", "week");
      if (creating === "research") {
        next.set("view", "team");
        if (layout === "list") next.set("detail", "1");
        setWorkbenchRevision((value) => value + 1);
      }
      read.invalidate();
      setParams(next);
      if (tab === "tasks") void read.refresh();
    } catch (e) {
      if (isCurrent())
        setFailure(e instanceof Error ? e.message : "任务创建结果暂未确认，请重试。填写内容已保留。");
    } finally {
      if (inFlight.current === ticket) {
        inFlight.current = undefined;
        setBusy(false);
      }
    }
  };
  if (relocated) return <Navigate to={relocated} replace />;
  const startTask = (kind: "personal" | "research") => {
    if (kind === "research" && !teamCreationAvailable) return;
    setCreating(kind);
    setFailure("");
    setBusy(false);
  };
  return (
    <div className="social-workspace workspace-workbench blue-task-page">
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
                  { key: "personal", label: "新建个人任务", disabled: !actor },
                  { key: "research", label: "新建课题组任务", disabled: !teamCreationAvailable },
                  { type: "divider" },
                  { key: "history", label: "计划记录" },
                ],
                onClick: ({ key }) => {
                  if (key === "history") setTab("history");
                  else if (key === "personal" || key === "research") startTask(key);
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
            planId={planId}
            requestId={requestId}
            onBack={() => setTab(params.get("returnTo") === "team" ? "team" : "tasks")}
            onOpenTask={(taskId) => {
              setParams(new URLSearchParams(workbenchTaskPath(taskId, "research").split("?")[1]));
            }}
            onDiscuss={openPersonalAssistant}
          />
        ) : tab === "team" ? (
          availability.supports(23) ? (
            <ResearchTeamWorkbench
              refresh={workbenchRevision}
              onCreate={teamCreationAvailable ? () => startTask("research") : undefined}
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
      {remindersOpen && <PersonalAssistantPanel open initialTab="followups" onClose={() => setRemindersOpen(false)} />}
      <Modal
        title={creating === "research" ? "新建课题组任务" : "新建个人任务"}
        open={!!creating}
        onCancel={() => { if (!busy) setCreating(undefined); }}
        closable={!busy}
        maskClosable={!busy}
        footer={null}
        destroyOnClose
        className="workspace-add-dialog blue-task-create-dialog"
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
          {creating === "research" ? <>
            <label>
              交付物
              <Input aria-label="交付物" maxLength={8000} placeholder="例如：带原始数据链接的汇总表"
                value={form.deliverable} disabled={busy}
                onChange={(e) => setForm((s) => ({ ...s, deliverable: e.target.value }))} />
            </label>
            <label>
              验收标准
              <Input.TextArea aria-label="验收标准" rows={2} maxLength={8000}
                value={form.acceptanceCriteria} disabled={busy}
                onChange={(e) => setForm((s) => ({ ...s, acceptanceCriteria: e.target.value }))} />
            </label>
            <label>
              负责人
              <Select
                aria-label="负责人"
                value={form.memberId}
                disabled={busy}
                options={[
                  { value: "", label: "我自己" },
                  ...(members.data?.data || []).filter((member) => member.id !== actor?.member.id)
                    .map((member) => ({ value: member.id, label: member.displayName })),
                ]}
                onChange={(memberId) => setForm((s) => ({ ...s, memberId }))}
              />
            </label>
            {members.error && <Alert type="warning" message="暂时无法读取成员"
              action={<Button size="small" onClick={() => void members.refresh()}>重试</Button>} />}
            {form.memberId && <p className="workspace-muted">创建后会邀请这位成员接受任务。</p>}
          </> : <>
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
          </>}
          {failure && <Alert type="error" message={failure} />}
          <div className="workspace-task-form-actions">
            <Button disabled={busy} onClick={() => setCreating(undefined)}>取消</Button>
          <Button
            type="primary"
            loading={busy}
            disabled={!canCreate}
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
