import { Alert, Button, Drawer, Spin } from "antd";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from 'react-router-dom';
import { workbenchTaskPath, workbenchTaskTarget } from './workbench-links';
import { researchApi } from './api';
import type { LocalDshSnapshot } from "@/types/localDsh";
import type { DshTaskState, TaskTarget } from "../../../../integrations/deepseek-harness/desktop/task-workspace";
import "./local-dsh.scss";
const TaskInbox = lazy(() => import('./WorkbenchTaskInbox').then(m => ({ default: m.WorkbenchTaskInbox })));

const labels = { stopped: "未启动", starting: "正在启动", running: "正在打开页面", stopping: "正在停止", error: "启动异常" };

type TaskBrief = { title: string; goal: string };

/** The workbench receives the task's goal and acceptance text so nobody retypes them. */
function TaskHandoff({
  target,
  brief,
  workspace,
  busy,
  onOpen,
  onHandoff,
  onReveal,
  onRefresh,
}: {
  target: TaskTarget;
  brief?: TaskBrief;
  workspace?: DshTaskState;
  busy: boolean;
  onOpen: () => void;
  onHandoff: () => void;
  onReveal: () => void;
  onRefresh: () => void;
}) {
  if (!brief) return null;
  const running = workspace?.phase === "running";
  return (
    <div className="local-dsh-task">
      <div className="local-dsh-task-text">
        <strong>{brief.title}</strong>
        <p>{brief.goal || "这项任务还没有写目标，可以先在工作台里说明。"}</p>
      </div>
      <dl className="local-dsh-task-facts">
        <div>
          <dt>工作文件夹</dt>
          <dd>
            {workspace
              ? workspace.binding.directory
              : "还没选。选好后助手只在这个文件夹里读写。"}
          </dd>
        </div>
        <div>
          <dt>DSH 会话</dt>
          <dd>
            {workspace
              ? workspace.binding.sessionTitle || "未命名会话"
              : "选好文件夹后自动建立"}
          </dd>
        </div>
      </dl>
      <div className="local-dsh-task-actions">
        {!workspace ? (
          <Button type="primary" loading={busy} onClick={onOpen}>
            选择工作文件夹并开始
          </Button>
        ) : (
          <Button type="primary" loading={busy} disabled={running} onClick={onHandoff}>
            {running ? "助手正在执行" : "把任务背景交给助手"}
          </Button>
        )}
        {workspace && (
          <Button disabled={busy} onClick={onReveal}>
            打开文件夹
          </Button>
        )}
        <Button type="link" size="small" onClick={onRefresh}>
          刷新状态
        </Button>
      </div>
      <p className="local-dsh-task-note">
        {workspace
          ? "交给助手的是目标、验收标准和已选资料，不含私人记忆。下面这块是 DSH 自己的界面。"
          : "选好工作文件夹后，任务目标、验收标准和已选资料版本会一起带过去。"}
      </p>
    </div>
  );
}

export function LocalDshPage() {
  const [params] = useSearchParams();
  const task = workbenchTaskTarget(params);
  const bridge = window.electronAPI?.localDsh;
  const seat = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<LocalDshSnapshot>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [brief, setBrief] = useState<TaskBrief>();
  const [workspace, setWorkspace] = useState<DshTaskState>();
  const target: TaskTarget | undefined =
    task.valid && task.id
      ? { taskId: task.id, kind: task.kind as TaskTarget["kind"] }
      : undefined;
  const alive = useRef(true);
  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    void (async () => {
      try {
        const response =
          target.kind === "research"
            ? await researchApi("task", { params: { id: target.taskId } })
            : await researchApi("personalWorkTask", { params: { id: target.taskId } });
        if (cancelled) return;
        const value =
          "task" in response.data ? response.data.task : response.data;
        setBrief({
          title: value.title,
          goal:
            ("goal" in value && value.goal) ||
            ("summary" in value && value.summary) ||
            "",
        });
      } catch {
        /* The workbench still works without the task strip. */
      }
    })();
    return () => { cancelled = true; };
  }, [target?.taskId, target?.kind]);
  const readWorkspace = async () => {
    if (!bridge?.taskStatus || !target) return;
    try {
      setWorkspace(await bridge.taskStatus(target));
    } catch {
      setWorkspace(undefined);
    }
  };
  useEffect(() => {
    if (!bridge?.taskStatus || !target) return;
    let cancelled = false;
    void (async () => {
      try {
        const bound = await bridge.taskStatus(target);
        if (cancelled) return;
        setWorkspace(bound);
        // Arriving from a task means that task is the one on screen: reopen its session
        // (idempotent) so the folder and session title are registered, then read again.
        if (bound && bridge.taskOpen) {
          await bridge.taskOpen(target, false);
          if (cancelled) return;
          setWorkspace(await bridge.taskStatus(target));
        }
      } catch {
        /* Read-only or finished tasks still show the strip; the DSH pane is unaffected. */
      }
    })();
    return () => { cancelled = true; };
  }, [bridge, target?.taskId, target?.kind]);
  const reveal = async () => {
    if (!bridge?.taskReveal || !target) return;
    try { await bridge.taskReveal(target); }
    catch (e) { setError(e instanceof Error ? e.message : "无法打开工作文件夹。"); }
  };
  useEffect(() => {
    alive.current = true;
    if (!bridge) return;
    let reading = false;
    const refresh = async () => {
      if (reading) return;
      reading = true;
      try {
        const next = await bridge.status();
        if (alive.current) setState(next);
      } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "无法读取本地服务状态。"); }
      finally { reading = false; }
    };
    void refresh();
    const timer = window.setInterval(refresh, 1200);
    return () => { alive.current = false; clearInterval(timer); void bridge.show(null).catch(() => {}); };
  }, [bridge]);
  useEffect(() => {
    if (!bridge || !state?.pageReady || !seat.current) return;
    const element = seat.current;
    const resize = () => {
      const overlay = [...document.querySelectorAll<HTMLElement>(".ant-modal-wrap, .ant-drawer-open, .ant-popover:not(.ant-popover-hidden)")]
        .some((node) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden");
      if (overlay) { void bridge.show(null).catch(() => {}); return; }
      const { x, y, width, height } = element.getBoundingClientRect();
      void bridge.show({ x, y, width, height }).catch(() => {});
    };
    const observer = new ResizeObserver(resize);
    const overlays = new MutationObserver(resize);
    overlays.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
    observer.observe(element);
    window.addEventListener("resize", resize);
    resize();
    return () => { observer.disconnect(); overlays.disconnect(); window.removeEventListener("resize", resize); void bridge.show(null).catch(() => {}); };
  }, [bridge, state?.pageReady]);
  const reconnect = async () => {
    if (!bridge) return;
    setBusy(true); setError("");
    try { const next = await bridge.start(); if (alive.current) setState(next); }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "操作失败，请重试。"); }
    finally { if (alive.current) setBusy(false); }
  };
  const openTask = async () => {
    if (!bridge?.taskOpen || !target) return;
    setBusy(true); setError("");
    try { await bridge.taskOpen(target, true); await readWorkspace(); }
    catch (e) { setError(e instanceof Error ? e.message : "无法打开工作文件夹，请重试。"); }
    finally { setBusy(false); }
  };
  const handoff = async () => {
    if (!bridge?.taskPrompt || !target) return;
    setBusy(true); setError("");
    try {
      await bridge.taskPrompt(
        target,
        "开始这项任务：先确认工作文件夹里的材料，说明打算怎么做，然后开始。",
        crypto.randomUUID(),
      );
      await readWorkspace();
    } catch (e) { setError(e instanceof Error ? e.message : "无法把任务背景交给助手，请重试。"); }
    finally { setBusy(false); }
  };
  return <section className="local-dsh-page" aria-label="工作台">
    <header className="local-dsh-header">
      <div><h1>工作台</h1><p>阅读材料、处理文件，和助手一起完成科研工作。</p></div>
      <nav aria-label="科研工作入口">
        {task.valid && <Link to={workbenchTaskPath(task.id!, task.kind as 'personal' | 'research')}>返回当前任务</Link>}
        <Button onClick={() => setTasksOpen(true)}>任务与交付</Button>
        <Link to="/library">共享资料</Link>
      </nav>
    </header>
    {!bridge && <Alert showIcon type="info" message="请使用支持本地 DSH 的 Windows 客户端" description="网页版及旧版客户端不能启动这台电脑上的 DSH。" />}
    {(error || state?.error) && <Alert showIcon type="error" message={error || state?.error} />}
    {target && (
      <TaskHandoff
        target={target}
        brief={brief}
        workspace={workspace}
        busy={busy}
        onOpen={() => void openTask()}
        onHandoff={() => void handoff()}
        onReveal={() => void reveal()}
        onRefresh={() => void readWorkspace()}
      />
    )}
    <div ref={seat} className="local-dsh-seat">
      {!state?.pageReady && <div className="local-dsh-welcome">
        {(busy || state?.phase === "starting" || state?.phase === "stopping") ? <><Spin size="large" /><h2>{state?.phase === "running" ? "正在打开工作台" : state ? labels[state.phase] : "正在读取状态"}</h2></> : <>
          <div className="local-dsh-monogram">DSH</div><h2>让助手在本机开始工作</h2>
          <p>登录 AcceptCat 后自动连接内置 DSH，使用当前账号的默认模型。</p>
          {bridge && state && <Button type="primary" loading={busy} onClick={() => void reconnect()}>重新连接</Button>}
          <div className="local-dsh-note"><strong>本地工作区</strong><p>选择工作目录即可开始。会话、插件和文件操作保存在这台电脑，并按 AcceptCat 账号分开。账号模型沿用「我的」中的配置，推理等级在输入框的模型菜单中选择。</p><p>模型调用经 AcceptCat 服务发送，工具在本机执行。退出账号或关闭 AcceptCat 会停止本地任务。</p></div>
        </>}
      </div>}
    </div>
    <Drawer title="任务与交付" open={tasksOpen} onClose={() => setTasksOpen(false)} width={460} destroyOnClose>
      <p>查看需要你处理的安排和成果，进入任务后可取用共享资料、继续工作、提交或验收。</p>
      {tasksOpen && <Suspense fallback={<Spin tip="正在读取任务" />}><TaskInbox presentation="overview" /></Suspense>}
    </Drawer>
  </section>;
}
