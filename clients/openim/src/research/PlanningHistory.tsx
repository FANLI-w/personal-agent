import { Alert, Button, Input, Modal, Segmented } from "antd";
import {
  ArrowLeftOutlined,
  CommentOutlined,
  HistoryOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useLayoutEffect, useRef, useState } from "react";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";
import { planDate, planProblems, requestStateLabels } from "./task-planning";
import { RecordWorkspace } from "./RecordWorkspace";
import { personalTaskTitle } from "./workbench-view";
import SafeMessageMarkdown from "./SafeMessageMarkdown";
import {
  createPlannerTasks,
  isDiscussionPlan,
  plannerCacheKey,
  plannerPlanInput,
  readPlannerHistory,
  type CreateIntent,
  type PlannerThread,
} from "./planner-chat";
import { usePersonalOperation } from "./usePersonalOperation";

export function PlanningHistory({
  planId,
  requestId,
  onOpenTask,
  onDiscuss,
  onBack,
}: {
  planId?: string;
  requestId?: string;
  onOpenTask: (id: string) => void;
  onDiscuss: (draft?: string) => Promise<boolean>;
  onBack: () => void;
}) {
  const actor = useResearchStore((s) => s.actor),
    generation = useResearchStore((s) => s.generation);
  const contacts = useResearchStore((s) => s.contacts);
  const [status, setStatus] = useState<"draft" | "confirmed">("draft");
  const [pages, setPages] = useState<(string | undefined)[]>([undefined]);
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState(planId || "");
  const [showRequests, setShowRequests] = useState(!!requestId);
  const [selectedRequest, setSelectedRequest] = useState(requestId);
  const [archive, setArchive] = useState<PlannerThread[]>();
  const [selectedThread, setSelectedThread] = useState("");
  const archiveOperation = usePersonalOperation(!!actor, "plan-archive");
  const [confirmation, setConfirmation] = useState<CreateIntent>();
  const [confirming, setConfirming] = useState(false);
  const [confirmFailure, setConfirmFailure] = useState("");
  const activeConfirmation = useRef<symbol>();
  const confirmOperation = usePersonalOperation(!!confirmation, `plan-confirm:${confirmation?.plan.id}`);
  const read = useResearchRead(
    (signal) =>
      researchApi("plans", {
        query: { status, limit: 30, cursor: pages[pages.length - 1] },
        signal,
      }),
    `chat-plan-history:${status}:${pages.join()}`,
    !!actor,
    { timeoutMs: 10000 },
  );
  const visible = (read.data?.data || []).filter((p) =>
    p.goal.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const selectedId = (search.trim() ? visible.find((p) => p.id === selection)?.id : selection) ||
    visible[0]?.id;
  const detail = useResearchRead(
    (signal) => researchApi("getPlan", { params: { id: selectedId! }, signal }),
    `history-plan:${selectedId}`,
    !!actor && !!selectedId,
    { timeoutMs: 10000 },
  );
  const plan = detail.data?.data;
  const linked = useResearchRead(
    (signal) => researchApi("planTasks", { params: { id: plan!.id }, signal }),
    `history-plan-tasks:${plan?.id}`,
    !!actor && plan?.status === "confirmed",
    { timeoutMs: 10000 },
  );
  const requests = useResearchRead(
    (signal) => researchApi("planningRequests", { query: { limit: 10 }, signal }),
    "chat-planning-request-history",
    !!actor,
    { poll: false, timeoutMs: 10000 },
  );
  const requestDetail = useResearchRead(
    (signal) => researchApi("getPlanRequest", { params: { id: selectedRequest! }, signal }),
    `history-request:${selectedRequest}`,
    showRequests && !!actor && !!selectedRequest,
    { poll: false, timeoutMs: 10000 },
  );
  const request = requestDetail.data?.data;
  const canConfirm = plan?.status === "draft" && plan.ownerId === actor?.member.id &&
    !isDiscussionPlan(plan.proposedItems) && !planProblems(plannerPlanInput(plan)).length &&
    !requests.data?.data.some((item) => item.planId === plan.id &&
      (item.status === "queued" || item.status === "running"));
  const people = new Map((contacts || []).flatMap(({ contact }) =>
    contact.identity.kind === "human" ? [[contact.identity.memberId, contact.displayName] as const] : [],
  ));
  if (actor) people.set(actor.member.id, actor.member.displayName);
  const recentByPlan = new Map<string, string>();
  for (const request of requests.data?.data || []) {
    if (!request.planId) continue;
    const previous = recentByPlan.get(request.planId);
    if (!previous || Date.parse(request.updatedAt) > Date.parse(previous))
      recentByPlan.set(request.planId, request.updatedAt);
  }
  useLayoutEffect(() => {
    setStatus("draft");
    setPages([undefined]);
    setSearch("");
    setSelection(planId || "");
    setShowRequests(!!requestId);
    setSelectedRequest(requestId);
    setArchive(undefined);
    setSelectedThread("");
    setConfirmation(undefined);
    setConfirming(false);
    setConfirmFailure("");
    activeConfirmation.current = undefined;
  }, [generation, planId, requestId]);
  const confirmPlan = async () => {
    if (!confirmation || activeConfirmation.current) return;
    const { isCurrent } = confirmOperation.capture();
    if (!isCurrent()) return;
    const ticket = Symbol();
    activeConfirmation.current = ticket;
    setConfirming(true);
    setConfirmFailure("");
    try {
      const created = await createPlannerTasks(researchApi, confirmation, isCurrent);
      if (!isCurrent()) return;
      setConfirmation(undefined);
      setStatus("confirmed");
      setPages([undefined]);
      setSelection(created.plan.id);
      await detail.refresh();
    } catch (error) {
      if (isCurrent())
        setConfirmFailure(error instanceof Error ? error.message : "暂时无法确认创建结果，请重试。");
    } finally {
      if (activeConfirmation.current === ticket) {
        activeConfirmation.current = undefined;
        setConfirming(false);
      }
    }
  };
  const openArchive = async () => {
    if (!actor) return;
    const { isCurrent } = archiveOperation.capture();
    let address = window.location.origin;
    try {
      const service = await window.electronAPI?.getResearchServiceStatus();
      const url = new URL(service?.address || address);
      if (url.protocol === "http:" || url.protocol === "https:")
        address = url.origin + url.pathname.replace(/\/$/, "");
    } catch {
      // The original conversation cache used the current origin as a fallback.
    }
    if (!isCurrent()) return;
    try {
      const key = plannerCacheKey(address, actor.member.id, actor.member.labId);
      const history = readPlannerHistory(localStorage.getItem(key));
      setArchive(history?.threads.filter((thread) => thread.messages.length || thread.draft) || []);
    } catch {
      setArchive([]);
    }
    setSelectedThread("");
  };
  const thread = archive?.find((item) => item.id === selectedThread);
  const closeRequests = () => {
    setShowRequests(false);
    setSelectedRequest(undefined);
  };
  return (
    <section className="record-page planning-history-page" aria-label="计划记录">
      <header className="record-page-heading">
        <div>
          <h2 className="sr-only">计划记录</h2>
        </div>
        <div className="record-page-actions">
          <Button onClick={() => void openArchive()}>历史对话</Button>
          <Button icon={<HistoryOutlined />} onClick={() => setShowRequests(true)}>
            生成记录
          </Button>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={onBack}
          >
            返回任务
          </Button>
        </div>
      </header>
      <RecordWorkspace
        label="计划列表与详情"
        list={
          <>
            <div className="record-list-tools">
              <Input
                placeholder="搜索本页计划"
                aria-label="搜索本页计划"
                value={search}
                allowClear
                onChange={(e) => setSearch(e.target.value)}
              />
              <div>
                <Segmented
                  aria-label="计划分类"
                  value={status}
                  options={[
                    { label: "待完善", value: "draft" },
                    { label: "已建立任务", value: "confirmed" },
                  ]}
                  onChange={(value) => {
                    setStatus(value as typeof status);
                    setPages([undefined]);
                    setSelection("");
                    setSearch("");
                  }}
                />
                <Button
                  type="text"
                  icon={<ReloadOutlined />}
                  aria-label="刷新计划"
                  loading={read.loading}
                  onClick={read.refresh}
                />
              </div>
            </div>
            {read.error && (
              <Alert
                type="error"
                message="暂时无法读取计划"
                description={read.error}
                action={<Button onClick={read.refresh}>重试</Button>}
              />
            )}
            {!read.data && !read.error && (
              <p className="record-state" role="status">
                正在读取计划…
              </p>
            )}
            {visible.map((p) => {
              const title = personalTaskTitle(p.goal);
              const rest = p.goal.slice(p.goal.indexOf(title) + title.length).replace(/^[。！？!?；;\s]+/, "");
              const question = plan?.id === p.id ? plan.unresolvedQuestions[0] : undefined;
              const hint = question ? (typeof question === "string" ? question : question.question) : rest;
              const recent = recentByPlan.get(p.id);
              return (
                <button
                  className="record-row"
                  key={p.id}
                  aria-pressed={selectedId === p.id}
                  onClick={() => setSelection(p.id)}
                >
                  <div>
                    <strong>{title}</strong>
                  </div>
                  {hint && <p>{question && "待补充 · "}{hint}</p>}
                  <small>
                    {recent ? "生成记录更新于" : "创建于"}{" "}
                    {new Date(recent || p.createdAt).toLocaleString("zh-CN")} · 第 {p.version} 版
                  </small>
                </button>
              );
            })}
            {read.data && !visible.length && (
              <div className="record-empty">
                <h3>
                  {search
                    ? "没有符合条件的计划"
                    : status === "draft"
                    ? "还没有待完善的计划"
                    : "还没有已建立任务的计划"}
                </h3>
                <p>
                  {search
                    ? "可以更换关键词，或翻页查找。"
                    : "已保存的计划会在这里显示。"}
                </p>
              </div>
            )}
            {(pages.length > 1 || read.data?.nextCursor) && (
              <div className="record-page-actions">
                <Button
                  disabled={pages.length === 1 || read.loading}
                  onClick={() => {
                    setPages((p) => p.slice(0, -1));
                    setSelection("");
                  }}
                >
                  上一页
                </Button>
                <Button
                  disabled={!read.data?.nextCursor || read.loading}
                  onClick={() => {
                    if (read.data?.nextCursor) {
                      setPages((p) => [...p, read.data!.nextCursor!]);
                      setSelection("");
                    }
                  }}
                >
                  下一页
                </Button>
              </div>
            )}
          </>
        }
      >
        {detail.error && (
          <Alert
            type="error"
            message="这个计划暂不可用"
            description={detail.error}
            action={
              <Button loading={detail.loading} onClick={detail.refresh}>
                重试读取
              </Button>
            }
          />
        )}
        {selectedId && !plan && !detail.error && (
          <p className="record-state" role="status">
            正在读取方案…
          </p>
        )}
        {!selectedId && (
          <div className="record-empty">
            <h3>选择一份计划</h3>
            <p>左侧显示你有权查看的计划。这里会展示目标、方案和待明确的问题。</p>
          </div>
        )}
        {plan && (
          <>
            <header className="record-detail-heading">
              <div>
                <span className={`record-status is-${plan.status}`}>
                  {plan.status === "confirmed"
                    ? "已建立任务"
                    : plan.unresolvedQuestions.length
                    ? "待补充"
                    : "草案"}
                </span>
                <h2 className="sr-only">计划内容</h2>
                <p>
                  创建于 {new Date(plan.createdAt).toLocaleString("zh-CN")} · v
                  {plan.version}
                </p>
              </div>
              <div className="record-page-actions">
                <Button
                  icon={<CommentOutlined />}
                  onClick={() => void onDiscuss(`我想讨论这个计划：\n${plan.goal}`.slice(0, 7800))}
                >
                  和个人助理讨论
                </Button>
                {canConfirm && <Button type="primary" onClick={() => {
                  setConfirmFailure("");
                  setConfirmation({ plan, key: crypto.randomUUID() });
                }}>按计划创建任务</Button>}
              </div>
            </header>
            {plan.unresolvedQuestions.length > 0 && (
              <div className="record-questions">
                <h3>下一步：补充这些问题</h3>
                {plan.unresolvedQuestions.map((q, i) => (
                  <p className="record-content" key={i}>
                    {typeof q === "string" ? q : q.question}
                  </p>
                ))}
              </div>
            )}
            <section className="record-detail-section">
              <h3>目标</h3>
              <p className="record-content">{plan.goal}</p>
            </section>
            {plan.outcome && (
              <section className="record-detail-section">
                <h3>预期成果</h3>
                <p className="record-content">{plan.outcome}</p>
              </section>
            )}
            <section className="record-detail-section">
              <h3>{plan.status === "confirmed" ? "任务安排" : "计划步骤"}</h3>
              {plan.proposedItems.length ? (
                <ol className="record-steps">
                  {plan.proposedItems.map((item) => (
                    <li key={item.id}>
                      <strong>{item.title}</strong>
                      <p>{item.goal}</p>
                      {item.deliverable && <p>交付物：{item.deliverable}</p>}
                      {item.acceptanceCriteria && <p>验收标准：{item.acceptanceCriteria}</p>}
                      {item.allocation && <p>分工：{
                        item.allocation.kind === "self" ? people.get(plan.ownerId) || "计划发起人" :
                        item.allocation.kind === "invitation" ? `邀请 ${people.get(item.allocation.memberId) || "已选成员"}` :
                        item.allocation.kind === "claim" ? "课题组成员认领" : "公共 Agent"
                      }</p>}
                      {item.schedule?.hardDeadline && <p>截止日期：{planDate(item.schedule.hardDeadline)}</p>}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="workspace-muted">尚未形成步骤。</p>
              )}
            </section>
            {plan.status === "confirmed" && (
              <section className="record-detail-section">
                <h3>已关联的任务</h3>
                {linked.error && (
                  <Alert
                    type="error"
                    message={linked.error}
                    action={<Button onClick={linked.refresh}>重试</Button>}
                  />
                )}
                {!linked.data && !linked.error && (
                  <p role="status">正在读取任务关联…</p>
                )}
                {linked.data?.data.steps.map((step) => (
                  <div key={step.itemId} className="record-page-actions">
                    {step.task && step.taskId ? (
                      <Button type="link" onClick={() => onOpenTask(step.taskId!)}>
                        {step.task.title}
                      </Button>
                    ) : (
                      <span className="workspace-muted">此步骤暂无可访问的任务。</span>
                    )}
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </RecordWorkspace>
      <Modal title="按计划创建任务" open={!!confirmation}
        okText="确认创建" cancelText="取消" confirmLoading={confirming}
        closable={!confirming} maskClosable={!confirming} cancelButtonProps={{ disabled: confirming }}
        onCancel={() => { if (!confirming) setConfirmation(undefined); }}
        onOk={() => void confirmPlan()}
        styles={{ body: { maxHeight: "60vh", overflow: "auto" } }}>
        {confirmation && <>
          <p>将按计划第 {confirmation.plan.version} 版创建 {confirmation.plan.proposedItems.length} 项任务。</p>
          <ol className="record-steps">
            {confirmation.plan.proposedItems.map((item) => <li key={item.id}>{item.title}</li>)}
          </ol>
        </>}
        {confirmFailure && <Alert type="error" message={confirmFailure} />}
      </Modal>
      <Modal
        title="生成记录"
        open={showRequests}
        width={640}
        footer={<Button onClick={closeRequests}>关闭</Button>}
        onCancel={closeRequests}
      >
        {selectedRequest ? <>
          <Button type="link" onClick={() => setSelectedRequest(undefined)}>返回生成记录</Button>
          {requestDetail.error && <Alert type="warning" message={requestDetail.error}
            action={<Button onClick={requestDetail.refresh}>重试</Button>} />}
          {!request && !requestDetail.error && <p role="status">正在读取生成结果…</p>}
          {request && <>
            <p>{requestStateLabels[request.status]} · {new Date(request.updatedAt).toLocaleString("zh-CN")}</p>
            {request.reply?.message && <SafeMessageMarkdown text={request.reply.message} />}
            {request.reply?.gaps.map((gap, index) => <p key={index}>{gap}</p>)}
            {request.planId && <Button onClick={() => {
              setSearch("");
              setSelection(request.planId!);
              closeRequests();
            }}>查看关联计划</Button>}
          </>}
        </> : <>
        {requests.error && (
          <Alert
            type="error"
            message={requests.error}
            action={<Button onClick={requests.refresh}>重试</Button>}
          />
        )}
        {!requests.data && !requests.error && <p role="status">正在读取生成记录…</p>}
        {requests.data?.data.map((r) => (
          <button
            key={r.id}
            className="record-row"
            onClick={() => setSelectedRequest(r.id)}
          >
            <strong>{requestStateLabels[r.status]}</strong>
            <small>{new Date(r.createdAt).toLocaleString("zh-CN")}</small>
          </button>
        ))}
        {requests.data && !requests.data.data.length && (
          <p className="record-empty">还没有生成记录。</p>
        )}
        </>}
      </Modal>
      <Modal
        title="历史对话"
        open={!!archive}
        width={640}
        footer={<Button onClick={() => setArchive(undefined)}>关闭</Button>}
        onCancel={() => setArchive(undefined)}
        styles={{ body: { maxHeight: "65vh", overflow: "auto" } }}
      >
        {thread ? <>
          <Button type="link" onClick={() => setSelectedThread("")}>返回历史对话</Button>
          <h3>{thread.title}</h3>
          {thread.messages.map((entry) => (
            <section className="record-detail-section" key={entry.id}>
              <strong>{entry.role === "user" ? "我" : entry.role === "assistant" ? "助理" : "系统"}</strong>
              <SafeMessageMarkdown text={entry.text} />
            </section>
          ))}
          {thread.draft && <section className="record-detail-section">
            <strong>未发送的草稿</strong>
            <p className="record-content">{thread.draft}</p>
          </section>}
        </> : archive?.length ? archive.map((item) => (
          <button type="button" className="record-row" key={item.id}
            onClick={() => setSelectedThread(item.id)}>
            <strong>{item.title}</strong>
            <small>{new Date(item.updatedAt).toLocaleString("zh-CN")}</small>
          </button>
        )) : <p className="record-empty">这台设备没有历史对话。</p>}
      </Modal>
    </section>
  );
}
