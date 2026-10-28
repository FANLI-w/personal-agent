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
  const run = async (action: "start" | "stop" | "choose") => {
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
        <Button disabled={!bridge || busy || active || state?.phase === "stopping"} onClick={() => void run("choose")}>安装目录</Button>
        {active ? <Button disabled={busy} onClick={() => void run("stop")}>停止 DSH</Button> :
          <Button type="primary" loading={busy} disabled={!bridge || state?.phase === "stopping"} onClick={() => void run("start")}>{state?.phase === "error" ? "重新启动" : "启动 DSH"}</Button>}
      </div>
    </header>
    {!bridge && <Alert showIcon type="info" message="请使用支持本地 DSH 的 Windows 客户端" description="网页版及旧版客户端不能启动这台电脑上的 DSH。" />}
    {(error || state?.error) && <Alert showIcon type="error" message={error || state?.error} />}
    <div ref={seat} className="local-dsh-seat">
      {!state?.pageReady && <div className="local-dsh-welcome">
        {(busy || state?.phase === "starting" || state?.phase === "stopping") ? <><Spin size="large" /><h2>{state?.phase === "running" ? "正在打开 DSH 页面" : state ? labels[state.phase] : "正在读取状态"}</h2></> : <>
          <div className="local-dsh-monogram">DSH</div><h2>让助手在本机开始工作</h2>
          <p>启动后将在这里打开 DeepSeek Harness 的完整 Web 界面，包含会话、工作目录、执行过程和设置。</p>
          <div className="local-dsh-note"><strong>首次使用</strong><p>请在 DSH 内配置模型和工作目录。此工作区独立于 AcceptCat 账号，也不会自动使用平台的模型密钥或导入旧聊天。</p><p>DSH 数据保存在本机，模型调用仍需要连接你配置的服务。切换回聊天时 DSH 继续运行；停止或退出 AcceptCat 会中断本地任务。</p></div>
        </>}
      </div>}
    </div>
    <footer title={state?.home}>DSH {state?.version || "0.2.1-rc.3"} · {state?.directory || "等待检测安装目录"}<span>独立本机数据 · {state?.home || "启动后创建"}</span></footer>
  </section>;
}
