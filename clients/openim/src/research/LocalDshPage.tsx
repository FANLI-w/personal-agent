import { Alert, Button, Spin, Tag } from "antd";
import { useEffect, useRef, useState } from "react";
import type { LocalDshSnapshot } from "@/types/localDsh";
import "./local-dsh.scss";

const labels = { stopped: "未启动", starting: "正在启动", running: "本地服务已启动", stopping: "正在停止", error: "启动异常" };

export function LocalDshPage() {
  const bridge = window.electronAPI?.localDsh;
  const seat = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<LocalDshSnapshot>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
  const run = async (action: "start" | "stop") => {
    if (!bridge) return;
    setBusy(true); setError("");
    try { const next = await bridge[action](); if (alive.current) setState(next); }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "操作失败，请重试。"); }
    finally { if (alive.current) setBusy(false); }
  };
  const active = state?.phase === "running" || state?.phase === "starting";
  return <section className="local-dsh-page" aria-label="本地 DSH">
    <header className="local-dsh-header">
      <div><h1>DSH <span>本地工作区 · 试用</span></h1>
        <p>在这台电脑上聊天、处理文件、运行工具与安装插件。</p></div>
      <div className="local-dsh-actions">
        {state && <Tag color={state.phase === "running" ? "green" : "default"}>{labels[state.phase]}</Tag>}
        {active ? <Button disabled={busy} onClick={() => void run("stop")}>停止 DSH</Button> :
          <Button type="primary" loading={busy} disabled={!bridge || state?.phase === "stopping"} onClick={() => void run("start")}>重新连接</Button>}
      </div>
    </header>
    {!bridge && <Alert showIcon type="info" message="请使用支持本地 DSH 的 Windows 客户端" description="网页版及旧版客户端不能启动这台电脑上的 DSH。" />}
    {(error || state?.error) && <Alert showIcon type="error" message={error || state?.error} />}
    <div ref={seat} className="local-dsh-seat">
      {!state?.pageReady && <div className="local-dsh-welcome">
        {(busy || state?.phase === "starting" || state?.phase === "stopping") ? <><Spin size="large" /><h2>{state?.phase === "running" ? "正在打开 DSH 页面" : state ? labels[state.phase] : "正在读取状态"}</h2></> : <>
          <div className="local-dsh-monogram">DSH</div><h2>让助手在本机开始工作</h2>
          <p>登录 AcceptCat 后自动连接内置 DSH，使用当前账号的默认模型。</p>
          <div className="local-dsh-note"><strong>本地工作区</strong><p>选择工作目录即可开始。会话、插件和文件操作保存在这台电脑，并按 AcceptCat 账号分开；模型设置沿用「我的」中的配置。</p><p>模型调用经 AcceptCat 服务发送，工具在本机执行。退出账号或关闭 AcceptCat 会停止本地任务。</p></div>
        </>}
      </div>}
    </div>
    <footer title={state?.home}>内置 DSH {state?.version || "0.2.1-rc.3"}{state?.model && ` · ${state.model}`}<span>按 AcceptCat 账号保存本机工作区</span></footer>
  </section>;
}
