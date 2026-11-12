import { Alert, Button, Input, Modal, Segmented } from "antd";
import {
  ArrowLeftOutlined,
  CommentOutlined,
  HistoryOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useLayoutEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";
import { requestStateLabels } from "./task-planning";
import { RecordWorkspace } from "./RecordWorkspace";
import { workbenchTaskPath } from "./workbench-links";
import { personalTaskTitle } from "./workbench-view";

export function PlanningHistory({
  onOpen,
  onBack,
}: {
  onOpen?: (target: { plan?: string; request?: string; task?: string }) => void;
  onBack?: () => void;
} = {}) {
  const [params, setParams] = useSearchParams();
  const actor = useResearchStore((s) => s.actor),
    generation = useResearchStore((s) => s.generation);
  const [status, setStatus] = useState<"draft" | "confirmed">("draft");
  const [pages, setPages] = useState<(string | undefined)[]>([undefined]);
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState("");
  const [showRequests, setShowRequests] = useState(false);
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
  const selected = visible.find((p) => p.id === selection) || visible[0];
  const detail = useResearchRead(
    (signal) => researchApi("getPlan", { params: { id: selected!.id }, signal }),
    `history-plan:${selected?.id}`,
    !!actor && !!selected,
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
    !!actor && showRequests,
    { poll: false, timeoutMs: 10000 },
  );
  useLayoutEffect(() => {
    setStatus("draft");
    setPages([undefined]);
    setSearch("");
    setSelection("");
    setShowRequests(false);
  }, [generation]);
  const open = (target: { plan?: string; request?: string; task?: string }) => {
    if (onOpen) onOpen(target);
    else if (target.task)
      setParams(
        new URLSearchParams(workbenchTaskPath(target.task, "research").split("?")[1]),
      );
    else
      setParams({
        view: "tasks",
        ...(target.plan ? { plan: target.plan } : {}),
        ...(target.request ? { planning: target.request } : {}),
      });
  };
  return (
    <section className="record-page planning-history-page" aria-label="计划记录">
      <header className="record-page-heading">
        <div>
          <h2 className="sr-only">计划记录</h2>
          <p>找到之前讨论的草案，继续完善；已建立的任务可直接查看。</p>
        </div>
        <div className="record-page-actions">
          <Button icon={<HistoryOutlined />} onClick={() => setShowRequests(true)}>
            生成记录
          </Button>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={onBack || (() => setParams({ view: "tasks" }))}
          >
            返回任务
          </Button>
        </div>
      </header>
      <RecordWorkspace
        label="计划列表与详情"
        footer={
          plan && (
            <Button
              type="primary"
              icon={<CommentOutlined />}
              onClick={() => open({ plan: plan.id })}
            >
              {plan.status === "confirmed" ? "查看方案与对话" : "继续讨论"}
            </Button>
          )
        }
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
                    { label: "草案", value: "draft" },
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
            {visible.map((p) => (
              <button
                className="record-row"
                key={p.id}
                aria-pressed={selected?.id === p.id}
                onClick={() => setSelection(p.id)}
              >
                <div>
                  <strong>{p.goal}</strong>
                  <span className={`record-status is-${p.status}`}>
                    {p.status === "confirmed" ? "已建立任务" : "草案"}
                  </span>
                </div>
                <small>
                  创建于 {new Date(p.createdAt).toLocaleDateString("zh-CN")} · v{p.version}
                </small>
              </button>
            ))}
            {read.data && !visible.length && (
              <div className="record-empty">
                <h3>
                  {search
                    ? "没有符合条件的计划"
                    : status === "draft"
                    ? "还没有保存的草案"
                    : "还没有已建立任务的计划"}
                </h3>
                <p>
                  {search
                    ? "可以更换关键词，或翻页查找。"
                    : "返回任务，和研究方案助手说说想完成什么。"}
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
        {selected && !plan && !detail.error && (
          <p className="record-state" role="status">
            正在读取方案…
          </p>
        )}
        {!selected && (
          <div className="record-empty">
            <h3>选择一份计划，接着推进</h3>
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
                <h2>{personalTaskTitle(plan.goal)}</h2>
                <p>
                  创建于 {new Date(plan.createdAt).toLocaleString("zh-CN")} · v
                  {plan.version}
                </p>
              </div>
            </header>
            {plan.goal !== personalTaskTitle(plan.goal) && (
              <section className="record-detail-section">
                <h3>目标</h3>
                <p className="record-content">{plan.goal}</p>
              </section>
            )}
            {plan.outcome && (
              <section className="record-detail-section">
                <h3>预期成果</h3>
                <p className="record-content">{plan.outcome}</p>
              </section>
            )}
            {plan.unresolvedQuestions.length > 0 && (
              <div className="record-questions">
                <h3>待明确</h3>
                {plan.unresolvedQuestions.map((q, i) => (
                  <p className="record-content" key={i}>
                    {typeof q === "string" ? q : q.question}
                  </p>
                ))}
              </div>
            )}
            <section className="record-detail-section">
              <h3>{plan.status === "confirmed" ? "任务安排" : "计划步骤（草案）"}</h3>
              {plan.proposedItems.length ? (
                <ol className="record-steps">
                  {plan.proposedItems.map((item) => (
                    <li key={item.id}>
                      <strong>{item.title}</strong>
                      <p>{item.goal}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="workspace-muted">尚未形成步骤，可以继续讨论。</p>
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
                      <Button type="link" onClick={() => open({ task: step.taskId! })}>
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
      <Modal
        title="生成记录"
        open={showRequests}
        width={640}
        footer={<Button onClick={() => setShowRequests(false)}>关闭</Button>}
        onCancel={() => setShowRequests(false)}
      >
        <p className="workspace-muted">
          最近 10 次生成请求；打开后可在原对话中继续处理。
        </p>
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
            onClick={() => {
              setShowRequests(false);
              open({ request: r.id });
            }}
          >
            <strong>{requestStateLabels[r.status]}</strong>
            <small>{new Date(r.createdAt).toLocaleString("zh-CN")}</small>
          </button>
        ))}
        {requests.data && !requests.data.data.length && (
          <p className="record-empty">还没有生成记录。</p>
        )}
      </Modal>
    </section>
  );
}
