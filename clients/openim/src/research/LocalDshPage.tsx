import { Alert, Button, Drawer, Spin } from "antd";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from 'react-router-dom';
import { workbenchTaskPath, workbenchTaskTarget } from './workbench-links';
import type { LocalDshSnapshot } from "@/types/localDsh";
import "./local-dsh.scss";
const TaskInbox = lazy(() => import('./WorkbenchTaskInbox').then(m => ({ default: m.WorkbenchTaskInbox })));

const labels = { stopped: "未启动", starting: "正在启动", running: "正在打开页面", stopping: "正在停止", error: "启动异常" };

export function LocalDshPage() {
  const [params] = useSearchParams();
  const task = workbenchTaskTarget(params);
  const bridge = window.electronAPI?.localDsh;
  const seat = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<LocalDshSnapshot>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const alive = useRef(true);
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
