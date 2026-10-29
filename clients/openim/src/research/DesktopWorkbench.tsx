import { Alert, Button, Input, Modal, Segmented, Select } from "antd";
import { useLayoutEffect, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import type { WorkbenchCard } from "@research-agent-platform/contracts";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";
import { usePersonalOperation } from "./usePersonalOperation";
import { researchApi } from "./api";
import { workspaceApi, useWorkspaceConversation } from "./workspace-api";
import {
  PersonalWorkDetail,
  workspaceMemberLabel,
  workspaceStatusLabel,
} from "./PersonalWorkDetail";
import { ResearchTaskPanel } from "./ResearchTaskPanel";
import { TaskWorkPage } from "./TaskWorkPage";
import SafeMessageMarkdown from "./SafeMessageMarkdown";
import "./workspace.scss";
import { useWorkspaceAvailability } from "./useWorkspaceAvailability";
import { WorkspaceUnavailable } from "./WorkspaceUnavailable";

import { ResearchTeamWorkbench } from "./ResearchTeamWorkbench";
import { relocatedWorkspace } from "./workspace-navigation";
import { WorkbenchPlanning } from "./WorkbenchSections";
import { workbenchTaskPath, workbenchTaskTarget } from "./workbench-links";
import { PlanningAgent } from "./PlanningAgent";
type ListFilter = "all" | "completed";
function WorkbenchOverview({
  card,
  onTask,
}: {
  card: WorkbenchCard;
  onTask: () => void;
}) {
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
          {workspaceStatusLabel[card.status] || card.progress.label || "查看状态"}
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
        {card.taskId && card.source !== "followup" && (
          <Button type="primary" onClick={onTask}>
            {card.category === "awaiting_me" ? "查看并处理" : "任务详情与操作"}
          </Button>
        )}
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
  const tab =
    params.get("view") === "planning" || params.get("plan") || params.get("planning")
      ? "planning"
      : params.get("view") === "team"
      ? "team"
      : "tasks";
  const [planningLaunch, setPlanningLaunch] = useState(0);
  const [planningExpanded, setPlanningExpanded] = useState(false);
  const [workbenchRevision, setWorkbenchRevision] = useState(0);
  const {
    id: requestedTask,
    kind: requestedKind,
    valid: requestedValid,
  } = workbenchTaskTarget(params);
  const filter: ListFilter =
    params.get("category") === "completed" ? "completed" : "all";
  const view =
    tab === "team"
      ? "team"
      : tab === "planning"
      ? params.get("panel") === "scheduled"
        ? "scheduled"
        : "planning"
      : "tasks";
  const [pages, setPages] = useState<(string | undefined)[]>([undefined]);
  const cursor = pages[pages.length - 1];
  const generation = useResearchStore((s) => s.generation),
    actor = useResearchStore((s) => s.actor),
    contacts = useResearchStore((s) => s.contacts);
  const availability = useWorkspaceAvailability(!relocated);
  const supported = availability.supports(21);
  const read = useResearchRead(
    () => workspaceApi.tasks(filter, cursor),
    `workbench:${filter}:${cursor || ""}`,
    tab === "tasks" && supported && !!actor,
  );
  const [selected, setSelected] = useState<WorkbenchCard>(),
    [details, setDetails] = useState(false);
  const [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  const [form, setForm] = useState({
    title: "",
    goal: "",
    contactIds: [] as string[],
    agentContactId: null as string | null,
  });
  const operation = usePersonalOperation(
      creating && supported,
      "create-workspace-task",
    ),
    inFlight = useRef(false);
  useLayoutEffect(() => {
    if (!supported) setCreating(false);
  }, [supported]);
  useLayoutEffect(() => {
    setSelected(undefined);
    setDetails(false);
    setCreating(false);
    setPages([undefined]);
    setFailure("");
    setBusy(false);
    inFlight.current = false;
    setForm({ title: "", goal: "", contactIds: [], agentContactId: null });
  }, [generation]);
  const activeCard =
    selected &&
    read.data?.data.find(
      (card) => card.id === selected.id && card.source === selected.source,
    );
  const eligible = contacts
    .map((e) => e.contact)
    .filter(
      (c) =>
        c.allowedActions.includes("chat") &&
        !(c.identity.kind === "human" && c.identity.memberId === actor?.member.id),
    );
  const setTab = (value: string) => {
    if (value !== "planning") setPlanningLaunch(0);
    setSelected(undefined);
    setDetails(false);
    const next = new URLSearchParams({ view: value });
    setParams(next);
  };
  const select = (card: WorkbenchCard) => {
    if (card.taskId && card.source !== "followup") {
      const next = new URLSearchParams(
        workbenchTaskPath(
          card.taskId,
          card.source === "research_task" ? "research" : "personal",
        ).split("?")[1],
      );
      if (filter === "completed") next.set("category", "completed");
      setParams(next);
      return;
    }
    setSelected(card);
    setDetails(false);
    const next = new URLSearchParams(params);
    next.delete("task");
    setParams(next, { replace: true });
  };
  const create = async () => {
    if (!supported || inFlight.current || !form.title.trim() || !form.goal.trim())
      return;
    const { isCurrent } = operation.capture();
    inFlight.current = true;
    setBusy(true);
    setFailure("");
    try {
      // A name is optional: the first sentence of the goal is enough to start.
      const title =
        form.title.trim() || form.goal.trim().split("\n")[0].trim().slice(0, 60);
      const created = await researchApi("createPersonalWorkTask", {
        body: { ...form, title, goal: form.goal.trim() },
      });
      if (!isCurrent()) return;
      setCreating(false);
      setForm({ title: "", goal: "", contactIds: [], agentContactId: null });
      const next = new URLSearchParams(
        workbenchTaskPath(created.data.id).split("?")[1],
      );
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
  // A task detail is read-and-act, not a place to start a new plan: the assistant
  // bar stays on the list so the detail screen keeps a single next action.
  const detailOpen = tab === "tasks" && !!requestedTask && requestedValid;
  const assistantBar = !!actor && !detailOpen;
  return (
    <div
      className={`social-workspace workspace-workbench ${
        planningExpanded && assistantBar ? "is-planning-expanded" : ""
      }`}
    >
      <header className="workspace-heading">
        <div>
          <h1>任务</h1>
        </div>
        <div className="workspace-heading-actions">
          {tab === "tasks" && (
            <Button
              type="primary"
              disabled={!supported}
              onClick={() => {
                setCreating(true);
                setFailure("");
                setBusy(false);
              }}
            >
              新建任务
            </Button>
          )}
        </div>
      </header>
      <div className="workspace-toolbar">
        <Segmented
          aria-label="任务视图"
          value={view}
          onChange={(value) => {
            setPlanningLaunch(0);
            const next = String(value);
            if (next === "scheduled")
              setParams({ view: "planning", panel: "scheduled" });
            else setTab(next);
          }}
          options={[
            { label: "待办", value: "tasks" },
            { label: "计划", value: "planning" },
            { label: "定时", value: "scheduled" },
            { label: "团队", value: "team" },
          ]}
        />
      </div>
      {supported && availability.error && (
        <Alert
          type="warning"
          showIcon
          message="服务连接不稳定，正在重新检查"
          description={`${availability.error} 已打开的任务和草稿会保留，最新进展以实际读取结果为准。`}
          action={
            <Button loading={availability.loading} onClick={availability.refresh}>
              重新检查
            </Button>
          }
        />
      )}
      <div
        className={`workbench-content ${
          tab === "planning" && params.get("panel") !== "scheduled"
            ? "is-planning-chat"
            : ""
        }`}
      >
        {!supported ? (
          <WorkspaceUnavailable
            feature="工作台"
            pending={!availability.data && !availability.error}
            error={availability.error}
            onRetry={availability.refresh}
          />
        ) : tab === "team" ? (
          availability.supports(23) ? (
            <ResearchTeamWorkbench
              refresh={workbenchRevision}
              onPlan={() => setPlanningLaunch((value) => value + 1)}
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
                <Button onClick={() => setTab("planning")}>打开任务规划</Button>
              </div>
            </section>
          )
        ) : tab === "planning" ? (
          <WorkbenchPlanning />
        ) : (
          <div className="workspace-task-body">
            <aside className="workspace-task-list">
              {read.error && (
                <Alert
                  type="error"
                  message={read.error}
                  action={<Button onClick={read.refresh}>重试</Button>}
                />
              )}
              {!read.data && !read.error && (
                <p role="status" className="p-5">
                  正在读取任务…
                </p>
              )}
              {(() => {
                const cards = read.data?.data || [],
                  partial = !!read.data?.nextCursor,
                  groups = [
                    { key: "awaiting_me", label: "需要你动手" },
                    { key: "ongoing", label: "进行中" },
                    { key: "scheduled", label: "定时安排" },
                    { key: "completed", label: "已完成" },
                  ]
                    .map((group) => ({
                      ...group,
                      items: cards.filter((card) => card.category === group.key),
                    }))
                    .filter((group) => group.items.length);
                return groups.map((group) => (
                  <section
                    className="workspace-task-group"
                    key={group.key}
                    aria-label={group.label}
                  >
                    <h2 className="workspace-task-group-label">
                      {group.label}
                      {partial ? "" : ` · ${group.items.length}`}
                    </h2>
                    {group.items.map((card) => (
                      <button
                        className="workspace-task-row"
                        key={`${card.source}:${card.id}`}
                        aria-pressed={
                          requestedTask
                            ? card.taskId === requestedTask &&
                              (card.source === "research_task"
                                ? "research"
                                : "personal") === requestedKind
                            : activeCard?.id === card.id
                        }
                        onClick={() => select(card)}
                      >
                        <span className="workspace-task-row-title">{card.title}</span>
                        <span className="workspace-status">
                          {workspaceStatusLabel[card.status] ||
                            card.progress.label ||
                            "查看状态"}
                        </span>
                        <p>{card.goal || "接受后可查看获准目标"}</p>
                        <footer>
                          {card.owner.displayName}
                          <span>
                            {workspaceStatusLabel[card.progress.label] ||
                              card.progress.label}
                          </span>
                        </footer>
                      </button>
                    ))}
                  </section>
                ));
              })()}
              {read.data && !read.data.data.length && (
                <div className="workspace-empty">
                  <h2>
                    {filter === "completed"
                      ? "还没有已完成的任务"
                      : "暂时没有要推进的任务"}
                  </h2>
                  <p>聊天中的协作建议会在这里确认，也可以新建一项任务。</p>
                </div>
              )}
              {read.data && read.data.data.length > 0 && (
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    setParams(
                      filter === "completed"
                        ? { view: "tasks" }
                        : { view: "tasks", category: "completed" },
                    );
                    setPages([undefined]);
                    setSelected(undefined);
                    setDetails(false);
                  }}
                >
                  {filter === "completed" ? "返回待办" : "查看已完成"}
                </Button>
              )}
              {(pages.length > 1 || read.data?.nextCursor) && (
                <div className="workspace-pages">
                  <Button
                    size="small"
                    disabled={pages.length === 1}
                    onClick={() => setPages((v) => v.slice(0, -1))}
                  >
                    上一页
                  </Button>
                  <Button
                    size="small"
                    disabled={!read.data?.nextCursor}
                    onClick={() => {
                      const nextCursor = read.data?.nextCursor;
                      if (nextCursor) setPages((v) => [...v, nextCursor]);
                    }}
                  >
                    更多任务
                  </Button>
                </div>
              )}
            </aside>
            <main className="workspace-detail-pane">
              {requestedTask ? (
                requestedValid ? (
                  <TaskWorkPage
                    key={`${generation}:${requestedKind}:${requestedTask}`}
                    taskId={requestedTask}
                    kind={requestedKind === "research" ? "research" : "personal"}
                    onChanged={read.refresh}
                  >
                    {(refreshTask) =>
                      requestedKind === "research" ? (
                        <div className="workspace-task-detail">
                          <ResearchTaskPanel
                            key={requestedTask}
                            taskId={requestedTask}
                            onChanged={refreshTask}
                          />
                        </div>
                      ) : (
                        <PersonalWorkDetail
                          key={requestedTask}
                          taskId={requestedTask}
                          onChanged={refreshTask}
                        />
                      )
                    }
                  </TaskWorkPage>
                ) : (
                  <Alert type="warning" message="任务链接无效，请从列表重新选择。" />
                )
              ) : activeCard ? (
                details && activeCard.taskId ? (
                  activeCard.source === "personal_task" ? (
                    <PersonalWorkDetail
                      key={activeCard.taskId}
                      taskId={activeCard.taskId}
                      onChanged={read.refresh}
                    />
                  ) : (
                    <div className="workspace-task-detail">
                      <ResearchTaskPanel
                        key={activeCard.taskId}
                        taskId={activeCard.taskId}
                      />
                    </div>
                  )
                ) : (
                  <WorkbenchOverview
                    key={`${activeCard.source}:${activeCard.id}`}
                    card={activeCard}
                    onTask={() => setDetails(true)}
                  />
                )
              ) : (
                <div className="workspace-empty">
                  <h2>把事情交代清楚，一起推进</h2>
                  <p>
                    选择任务查看目标、实际成员和结果。只有明确验收后，任务才会标为完成。
                  </p>
                </div>
              )}
            </main>
          </div>
        )}
      </div>
      {!!actor && (
        <PlanningAgent
          hidden={detailOpen}
          available={supported && availability.supports(23)}
          conversationAvailable={availability.supports(32)}
          full={tab === "planning" && params.get("panel") !== "scheduled"}
          focus={planningLaunch}
          onExpandedChange={setPlanningExpanded}
          planId={tab === "planning" ? params.get("plan") || undefined : undefined}
          requestId={
            tab === "planning" ? params.get("planning") || undefined : undefined
          }
          onCreated={() => {
            setWorkbenchRevision((value) => value + 1);
            void read.refresh();
          }}
          onTeam={() => setTab("team")}
        />
      )}
      <Modal
        title="新建一项任务"
        open={creating}
        onCancel={() => setCreating(false)}
        footer={null}
        destroyOnClose
        className="workspace-add-dialog"
      >
        <div className="workspace-task-form">
          <label>
            任务名称（可留空，默认取第一句）
            <Input
              aria-label="任务名称"
              maxLength={200}
              value={form.title}
              disabled={busy}
              onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
            />
          </label>
          <label>
            希望完成什么
            <Input.TextArea
              aria-label="任务目标"
              rows={4}
              maxLength={8000}
              value={form.goal}
              disabled={busy}
              onChange={(e) => setForm((s) => ({ ...s, goal: e.target.value }))}
            />
          </label>
          <label>
            一起参与的联系人
            <Select
              aria-label="任务成员"
              mode="multiple"
              value={form.contactIds}
              disabled={busy}
              options={eligible.map((c) => ({
                value: c.id,
                label: `${c.displayName}${
                  c.identity.kind === "human" ? "" : " · Agent"
                }`,
              }))}
              onChange={(contactIds) =>
                setForm((s) => ({
                  ...s,
                  contactIds,
                  agentContactId:
                    s.agentContactId && contactIds.includes(s.agentContactId)
                      ? s.agentContactId
                      : null,
                }))
              }
            />
          </label>
          <details>
            <summary>预选一个处理任务的 Agent（可选）</summary>
            <Select
              aria-label="任务预选 Agent"
              allowClear
              value={form.agentContactId || undefined}
              disabled={busy}
              options={eligible
                .filter((c) => c.identity.kind !== "human" && !c.agentRuntime)
                .map((c) => ({ value: c.id, label: c.displayName }))}
              onChange={(id) =>
                setForm((s) => ({
                  ...s,
                  agentContactId: id || null,
                  contactIds:
                    id && !s.contactIds.includes(id)
                      ? [...s.contactIds, id]
                      : s.contactIds,
                }))
              }
            />
          </details>
          <p className="workspace-muted">
            先保存草案，再确认建群和独立邀请；不会自动开始模型处理。
          </p>
          {failure && <Alert type="error" message={failure} />}
          <Button
            type="primary"
            loading={busy}
            disabled={!form.goal.trim()}
            onClick={() => void create()}
          >
            保存任务草案
          </Button>
        </div>
      </Modal>
    </div>
  );
}
