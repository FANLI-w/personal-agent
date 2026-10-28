import { TaskKnowledgePanel } from './TaskKnowledgePanel';
import { Alert, Button, Checkbox, Input, Segmented, Select } from "antd";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type {
  DshTaskState,
  TaskTarget,
} from "../../../../integrations/deepseek-harness/desktop/task-workspace";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { usePersonalOperation } from "./usePersonalOperation";
import SafeMessageMarkdown from "./SafeMessageMarkdown";
import { taskEventRows } from "./task-dsh-events";
import "./task-work-page.scss";
import { Link } from "react-router-dom";

const phases = {
  ready: "可以开始",
  running: "正在执行",
  finished: "本轮已结束 · 待核对成果",
  interrupted: "执行中断 · 结果待核对",
  failed: "本轮未完成",
};

export function TaskWorkPage({
  taskId,
  kind,
  children,
  onChanged,
}: TaskTarget & {
  children: (refresh: () => Promise<void>) => ReactNode;
  onChanged: () => Promise<void>;
}) {
  const bridge = window.electronAPI?.localDsh;
  const target = { taskId, kind },
    operation = usePersonalOperation(true, `task-work:${kind}:${taskId}`);
  const [tab, setTab] = useState("execute"),
    [state, setState] = useState<DshTaskState>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [connectionError, setConnectionError] = useState("");
  const [text, setText] = useState(""),
    [note, setNote] = useState(""),
    [summary, setSummary] = useState(""),
    [preview, setPreview] = useState("");
  const [selected, setSelected] = useState<string[]>([]),
    [collection, setCollection] = useState(""),
    [notice, setNotice] = useState("");
  const flight = useRef(false),
    request = useRef<{ id: string; text: string }>(),
    noteLoaded = useRef(false);
  const transcript = useRef<HTMLDivElement>(null),
    follow = useRef(true);
  useEffect(() => {
    flight.current = false;
    setBusy(false);
  }, [operation.scope]);
  const detail = useResearchRead(async (signal) => {
    if (kind === "personal") {
      const r = await researchApi("personalWorkTask", {
        params: { id: taskId },
        signal,
      });
      return { task: r.data, artifacts: [] };
    }
    const r = await researchApi("task", { params: { id: taskId }, signal });
    return "task" in r.data
      ? { task: r.data.task, artifacts: r.data.artifacts || [] }
      : { task: r.data, artifacts: [] };
  }, `work-page:${kind}:${taskId}`);
  const collections = useResearchRead(
    () => researchApi("researchCollections", { query: { limit: 100 } }),
    `task-collections:${taskId}`,
    tab === "materials",
  );
  const library = useResearchRead(
    () =>
      researchApi("researchFiles", {
        params: { id: collection },
        query: { limit: 100 },
      }),
    `task-library:${collection}`,
    tab === "materials" && !!collection,
  );
  const task = detail.data?.task,
    actions: string[] = task?.allowedActions || [];
  const canWork =
    kind === "research"
      ? actions.includes("submit")
      : actions.some((a) => ["run", "submit"].includes(a));
  const refresh = async () => {
    if (!bridge?.taskStatus) return;
    const { isCurrent } = operation.capture();
    const next = await bridge.taskStatus(target);
    if (isCurrent()) {
      setConnectionError("");
      setState(next);
      if (next && !noteLoaded.current) {
        setNote(next.binding.note);
        if (next.binding.delivery?.status === "pending") {
          setSummary(next.binding.delivery.summary);
          setSelected(next.binding.delivery.names);
        }
        noteLoaded.current = true;
      }
    }
  };
  useEffect(() => {
    let cancelled = false,
      reading = false;
    const poll = async () => {
      if (reading || flight.current || cancelled || !bridge?.taskStatus) return;
      reading = true;
      try {
        await refresh();
      } catch (e) {
        if (!cancelled) {
          setState(undefined);
          setConnectionError(e instanceof Error ? e.message : "本地进度暂不可用。");
        }
      } finally {
        reading = false;
      }
    };
    void poll();
    const timer = window.setInterval(poll, 3500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [operation.scope, bridge]);
  const rows = taskEventRows(state?.events || []);
  useEffect(() => {
    if (follow.current && transcript.current)
      transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [state?.events.at(-1)?.seq]);
  const command = async (action: () => Promise<unknown>) => {
    if (flight.current) return;
    const { isCurrent } = operation.capture();
    flight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      if (isCurrent()) {
        await refresh();
        await detail.refresh();
        await onChanged();
      }
    } catch (e) {
      if (isCurrent()) {
        setError(e instanceof Error ? e.message : "操作未完成，请重试。");
        await refresh().catch(() => {});
      }
    } finally {
      if (isCurrent()) {
        flight.current = false;
        setBusy(false);
      }
    }
  };
  const send = () =>
    command(async () => {
      const pending = state?.binding.pending;
      const attempt = pending
        ? { id: pending.requestId, text: pending.userText || pending.text }
        : request.current || { id: crypto.randomUUID(), text };
      request.current = attempt;
      await bridge!.taskPrompt(target, attempt.text, attempt.id);
      request.current = undefined;
      setText("");
    });
  const importFile = (source: {
    kind: "artifact" | "library";
    id: string;
    version: number;
  }) =>
    command(async () => {
      await bridge!.taskImport(target, source);
      setNotice("已将选定版本保存到本任务目录。");
    });
  const submit = () =>
    command(async () => {
      const { isCurrent } = operation.capture();
      await bridge!.taskSubmit(target, summary, selected);
      if (isCurrent()) {
        setNotice("成果已提交，等待验收。");
        setTab("details");
      }
    });
  return (
    <section className="task-work-page" aria-label="任务工作页">
      <header className="task-work-heading">
        <div>
          <span>任务</span>
          <h2>{task?.title || "正在读取任务…"}</h2>
        </div>
        <span>
          {connectionError
            ? "连接中断 · 进度待核对"
            : state
            ? phases[state.phase]
            : "尚未建立本机工作区"}
        </span>
      </header>
      <Segmented
        aria-label="任务工作页栏目"
        value={tab}
        onChange={(v) => setTab(String(v))}
        options={[
          { value: "execute", label: "执行" },
          { value: "materials", label: "资料与成果" },
          { value: "details", label: "安排与验收" },
          { value: "knowledge", label: "规则与记忆" },
        ]}
      />
      {(error || detail.error || connectionError) && (
        <Alert
          type="error"
          message={error || detail.error || connectionError}
          action={
            <Button onClick={() => void command(async () => {})}>刷新核对</Button>
          }
        />
      )}
      {task && "goal" in task && task.goal && (
        <details>
          <summary>目标与交付要求</summary>
          <SafeMessageMarkdown text={task.goal} />
          {"acceptanceCriteria" in task && <p>{task.acceptanceCriteria}</p>}
        </details>
      )}
      {notice && <Alert type="success" message={notice} />}
      {tab === 'knowledge' && <TaskKnowledgePanel key={kind+':'+taskId} target={target} state={state} canWork={canWork} busy={busy} command={command} />}
      {tab === "details" ? (
        children(async () => {
          setNotice("");
          await detail.refresh();
          await onChanged();
        })
      ) : (
        <>
          {!bridge?.taskOpen && (
            <Alert
              type="info"
              message="本机执行需要新版 Windows 客户端；安排与验收仍可使用。"
            />
          )}
          {!canWork && (
            <Alert
              type="info"
              message="请先在“安排与验收”中承接、开始任务。已完成或已取消的任务保留记录。"
            />
          )}
          {tab === "execute" && (
            <>
              {!state ? (
                <div className="task-work-empty">
                  <h3>在此任务中开始工作</h3>
                  <p>使用当前 AcceptCat 模型。会话、进度和文件按任务保存在这台电脑。</p>
                  <Button
                    type="primary"
                    disabled={!bridge?.taskOpen || !canWork || busy}
                    onClick={() =>
                      void command(async () => {
                        await bridge!.taskOpen(target);
                      })
                    }
                  >
                    建立任务工作区
                  </Button>
                  <Button
                    disabled={!bridge?.taskOpen || !canWork || busy}
                    onClick={() =>
                      void command(async () => {
                        await bridge!.taskOpen(target, true);
                      })
                    }
                  >
                    选择已有文件夹
                  </Button>
                </div>
              ) : (
                <>
                  <div
                    className="task-work-transcript"
                    ref={transcript}
                    onScroll={() => {
                      const e = transcript.current!;
                      follow.current =
                        e.scrollHeight - e.scrollTop - e.clientHeight < 70;
                    }}
                  >
                    {state.hasMore && (
                      <p className="task-work-muted">
                        此处展示最近 100 条消息，完整历史保存在 DSH 会话中。
                      </p>
                    )}
                    {rows.map((row) => (
                      <article
                        key={row.seq}
                        className={`task-work-message ${row.role}`}
                      >
                        <strong>
                          {row.role === "user"
                            ? "你"
                            : row.role === "assistant"
                            ? "本机 DSH"
                            : "工具记录"}
                        </strong>
                        <SafeMessageMarkdown text={row.text} />
                        {"detail" in row && row.detail && (
                          <details>
                            <summary>查看工具记录</summary>
                            <pre className="task-work-preview">{row.detail}</pre>
                          </details>
                        )}
                        {row.role === "assistant" && (
                          <Button
                            size="small"
                            onClick={() => {
                              setSummary(row.text.slice(0, 8000));
                              setTab("materials");
                            }}
                          >
                            用作成果摘要
                          </Button>
                        )}
                      </article>
                    ))}
                    {state.needsApproval && (
                      <Alert
                        type="warning"
                        message="工具正在等待你确认"
                        description={
                          <>
                            请到 <Link to="/dsh">DSH 页面</Link>选择“
                            {state.binding.sessionTitle || task?.title}
                            ”会话，核对操作并允许一次或拒绝，然后回到此任务继续查看。
                          </>
                        }
                      />
                    )}
                    {state.phase === "running" && (
                      <p role="status">正在执行，工具与回复记录会持续更新…</p>
                    )}
                    {["failed", "interrupted"].includes(state.phase) && (
                      <Alert
                        type="warning"
                        message="请先核对文件与工具记录，再继续；不会自动重复执行。"
                      />
                    )}
                  </div>
                  <div className="task-work-composer">
                    <Input.TextArea
                      aria-label="任务执行要求"
                      rows={3}
                      value={text}
                      maxLength={16000}
                      disabled={!!state.binding.pending || busy || !canWork}
                      placeholder="说明这一步要处理什么。先在“资料与成果”中选入材料。"
                      onChange={(e) => {
                        setText(e.target.value);
                        request.current = undefined;
                      }}
                    />
                    <Button
                      type="primary"
                      loading={busy}
                      disabled={!canWork || (!text.trim() && !state.binding.pending)}
                      onClick={() => void send()}
                    >
                      {state.binding.pending
                        ? "核对并重试原请求"
                        : state.phase === "running"
                        ? "排入下一步"
                        : "发送"}
                    </Button>
                  </div>
                  <div className="task-work-muted">
                    {state.phase === "running" && (
                      <Button
                        disabled={busy}
                        onClick={() => void command(() => bridge!.taskCancel(target))}
                      >
                        停止本轮
                      </Button>
                    )}{" "}
                    <Link to="/dsh">在 DSH 中使用完整工具</Link> · 选择“
                    {state.binding.sessionTitle || task?.title}
                    ”会话，可处理工具确认、追问和查看完整轨迹。
                  </div>
                  <details>
                    <summary>进度与下一步</summary>
                    <p className="task-work-muted">
                      本机备注，不代表任务已验收。工作目录：{state.binding.directory}
                    </p>
                    <Input.TextArea
                      aria-label="任务进度备注"
                      value={note}
                      maxLength={4000}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="已经完成什么、下一步、当前阻碍"
                    />
                    <Button
                      disabled={busy || !canWork}
                      onClick={() => void command(() => bridge!.taskNote(target, note))}
                    >
                      保存进度
                    </Button>
                  </details>
                </>
              )}
            </>
          )}
          {tab === "materials" && (
            <div className="task-work-materials">
              <h3>选入任务资料</h3>
              <p>
                仅将你选定且当前有权访问的版本复制到本机。团队成员不会因此获得私人资料权限。
              </p>
              {detail.data?.artifacts.map((a) => (
                <div className="task-work-file" key={a.id}>
                  <span>
                    {a.filename} · v{a.version}
                  </span>
                  <Button
                    disabled={
                      !state || busy || !canWork || a.accessStatus === "revoked"
                    }
                    onClick={() =>
                      void importFile({
                        kind: "artifact",
                        id: a.id,
                        version: a.version,
                      })
                    }
                  >
                    用于本任务
                  </Button>
                </div>
              ))}
              <Select
                aria-label="资料集"
                placeholder="选择资料板块中的资料集"
                value={collection || undefined}
                onChange={setCollection}
                options={collections.data?.data.map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
              />
              {(collections.error || library.error) && (
                <Alert type="error" message={collections.error || library.error} />
              )}
              {library.data?.data.map((f) => (
                <div className="task-work-file" key={f.id}>
                  <span>
                    {f.filename} · v{f.version}
                  </span>
                  <Button
                    disabled={!state || busy || !canWork || f.status !== "available"}
                    onClick={() =>
                      void importFile({ kind: "library", id: f.id, version: f.version })
                    }
                  >
                    用于本任务
                  </Button>
                </div>
              ))}
              {!!state?.binding.sources.length && (
                <details>
                  <summary>已选入的资料版本</summary>
                  {state.binding.sources.map((s) => (
                    <p key={`${s.kind}:${s.id}:${s.version}`}>
                      {s.filename} · v{s.version} · {s.localName}
                    </p>
                  ))}
                </details>
              )}
              <h3>文件与待交付成果</h3>
              <p>先查看文件，再选择需要共享的成果。仅勾选并提交的文件会上传。</p>
              {state?.files.map((f) => (
                <div className="task-work-file" key={f.name}>
                  <Checkbox
                    disabled={kind === "personal" || busy}
                    checked={selected.includes(f.name)}
                    onChange={(e) =>
                      setSelected((v) =>
                        e.target.checked
                          ? [...v, f.name]
                          : v.filter((n) => n !== f.name),
                      )
                    }
                  >
                    {f.name} · {f.size} 字节
                  </Checkbox>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void command(async () => {
                        const output = await bridge!.taskOutput(target, f.name);
                        setPreview(
                          output.preview ||
                            "此格式请在本机工作目录中查看；支持提交 PDF/PNG。",
                        );
                      })
                    }
                  >
                    预览
                  </Button>
                </div>
              ))}
              {preview && <pre className="task-work-preview">{preview}</pre>}
              {kind === "personal" && (
                <p>
                  个人协作任务首版提交文字成果；文件保存在本机。科研任务支持共享成果文件。
                </p>
              )}
              <Input.TextArea
                aria-label="成果摘要"
                rows={5}
                maxLength={8000}
                placeholder="说明结果、引用来源与仍需核对的内容。"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
              {state?.binding.delivery?.versionConflict && (
                <Alert
                  type="warning"
                  message="提交时任务已被更新"
                  description="先到“安排与验收”核对变更；确认仍按这一版成果提交后，使用最新任务版本重试。已上传文件会继续复用。"
                  action={
                    <Button
                      disabled={busy || !actions.includes("submit")}
                      onClick={() =>
                        void command(async () => {
                          await bridge!.taskRebase(target);
                          const d = state.binding.delivery!;
                          await bridge!.taskSubmit(target, d.summary, d.names);
                          setTab("details");
                          setNotice("成果已提交，等待验收。");
                        })
                      }
                    >
                      已核对，重新提交此版
                    </Button>
                  }
                />
              )}
              <Button
                type="primary"
                loading={busy}
                disabled={
                  !bridge?.taskSubmit ||
                  !state ||
                  !summary.trim() ||
                  (!actions.includes("submit") &&
                    state?.binding.delivery?.status !== "pending")
                }
                onClick={() => void submit()}
              >
                提交成果，等待验收
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
