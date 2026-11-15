import deepchatAvatar from "@/assets/avatar/dafeiyu.png";
import { Alert, Button, Drawer, Input, Spin } from "antd";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ExportOutlined } from "@ant-design/icons";
import { taskStatusFailure, taskStatusRouteMatches } from "./task-status-read";
import {
  nativeWorkbenchTaskPath,
  workbenchTaskPath,
  workbenchTaskTarget,
} from "./workbench-links";
import { researchApi } from "./api";
import { useResearchStore } from "./store";
import { selectedTeamEntryIds } from "./team-material-selection";
import {
  clearNativeWorkbenchHandoff,
  readNativeWorkbenchHandoff,
  readWorkbenchServiceOrigin,
} from "./native-workbench-handoff";
import {
  readRecentWorkbench,
  recentWorkbenchKey,
  workbenchOutputs,
  readWorkbenchInstruction,
  workbenchInstructionKey,
} from "./local-dsh-context";
import type { LocalDshSnapshot } from "@/types/localDsh";
import type {
  DshTaskState,
  TaskTarget,
} from "../../../../integrations/deepseek-harness/desktop/task-workspace";
import "./local-dsh.scss";

const TaskInbox = lazy(() =>
  import("./WorkbenchTaskInbox").then((m) => ({ default: m.WorkbenchTaskInbox })),
);
const labels = {
  stopped: "未启动",
  starting: "正在启动",
  running: "正在打开页面",
  stopping: "正在停止",
  error: "启动异常",
};
type TaskBrief = { title: string; goal: string };

export function LocalDshPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const task = workbenchTaskTarget(params);
  const bridge = window.electronAPI?.localDsh;
  const actor = useResearchStore((s) => s.actor);
  const generation = useResearchStore((s) => s.generation);
  const memberId = actor?.member.id,
    labId = actor?.member.labId;
  const seat = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<LocalDshSnapshot>();
  const [workspace, setWorkspace] = useState<DshTaskState>();
  const [brief, setBrief] = useState<TaskBrief>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [materialReceipt, setMaterialReceipt] = useState("");
  const [attachedScope, setAttachedScope] = useState("");
  const [connectedScope, setConnectedScope] = useState("");
  const [canStage, setCanStage] = useState(false);
  const [instructionRecord, setInstruction] = useState<{
    key: string;
    text: string;
    requestId: string;
  }>();
  const [instructionSending, setInstructionSending] = useState(false);
  const instructionFlight = useRef(false);
  const [service, setService] = useState<{ scope: string; origin: string }>();
  const alive = useRef(true);
  const accountScope = `${generation}:${memberId}:${labId}`;
  const serviceOrigin = service?.scope === accountScope ? service.origin : undefined;
  const routeScope = `${accountScope}:${serviceOrigin}:${params.toString()}`;
  const visibleScope = useRef(routeScope);
  visibleScope.current = routeScope;
  const target: TaskTarget | undefined =
    task.valid && task.id
      ? { taskId: task.id, kind: task.kind as TaskTarget["kind"] }
      : undefined;
  const materialIds = selectedTeamEntryIds(params),
    materialId = materialIds.join(",");
  const materialRevision = params.get("teamRevision"),
    nonce = params.get("handoff");
  const recentKey =
    memberId && labId && serviceOrigin
      ? recentWorkbenchKey(serviceOrigin, memberId, labId)
      : undefined;
  const instructionKey =
    memberId && labId && serviceOrigin && target
      ? workbenchInstructionKey({ memberId, labId, serviceOrigin, generation }, target)
      : undefined;
  const instruction =
    instructionRecord?.key === instructionKey ? instructionRecord : undefined;
  useEffect(() => {
    const draft = instructionKey
      ? readWorkbenchInstruction(sessionStorage, instructionKey)
      : undefined;
    setInstruction(
      draft && instructionKey ? { ...draft, key: instructionKey } : undefined,
    );
    setInstructionSending(false);
    instructionFlight.current = false;
  }, [instructionKey]);

  useEffect(() => {
    let cancelled = false;
    if (!memberId || !labId) return;
    void readWorkbenchServiceOrigin()
      .then((origin) => {
        if (!cancelled) setService({ scope: accountScope, origin });
      })
      .catch((failure) => {
        if (!cancelled) {
          setService(undefined);
          setError(failure.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accountScope, attempt]);

  // The sidebar restores a pointer only after the server confirms current access.
  useEffect(() => {
    if (task.id || !recentKey || !bridge) return;
    const recent = readRecentWorkbench(localStorage, recentKey);
    if (!recent) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response =
          recent.kind === "research"
            ? await researchApi("task", {
                params: { id: recent.taskId },
                signal: controller.signal,
              })
            : await researchApi("personalWorkTask", {
                params: { id: recent.taskId },
                signal: controller.signal,
              });
        const value = "task" in response.data ? response.data.task : response.data;
        if ((await readWorkbenchServiceOrigin()) !== serviceOrigin)
          throw Error("科研服务已切换。");
        if (
          !controller.signal.aborted &&
          visibleScope.current === routeScope &&
          value.id === recent.taskId
        )
          navigate(nativeWorkbenchTaskPath(recent.taskId, recent.kind), {
            replace: true,
          });
      } catch (failure) {
        if (controller.signal.aborted || visibleScope.current !== routeScope) return;
        const status = (failure as { status?: number }).status;
        if ([401, 403, 404].includes(status || 0)) {
          try {
            localStorage.removeItem(recentKey);
          } catch {
            /* optional pointer */
          }
        }
        setError("最近任务暂时无法恢复，请从任务与交付重新打开。");
      }
    })();
    return () => controller.abort();
  }, [bridge, recentKey, task.id, routeScope, navigate]);

  // Opening a task connects its context and exact saved session; it never starts a model run.
  useEffect(() => {
    setWorkspace(undefined);
    setBrief(undefined);
    setError("");
    setMaterialReceipt("");
    setBusy(false);
    setAttachedScope("");
    setConnectedScope("");
    setCanStage(false);
    if (!target || !bridge || !memberId || !labId || !serviceOrigin) return;
    const controller = new AbortController();
    const current = () =>
      !controller.signal.aborted && visibleScope.current === routeScope &&
      taskStatusRouteMatches(window.location.hash, target);
    const verifyService = async () => {
      if (!current()) return false;
      if ((await readWorkbenchServiceOrigin()) !== serviceOrigin) {
        if (current()) {
          setWorkspace(undefined);
          setAttachedScope("");
          setConnectedScope("");
        }
        throw Error("科研服务已切换，请从当前服务的任务重新打开工作台。");
      }
      return current();
    };
    let polling = false,
      initializing = true,
      resumedRunning = false;
    const refresh = async () => {
      if (polling || initializing || !current()) return;
      polling = true;
      try {
        if (!(await verifyService())) return;
        const next = await bridge.taskStatus(target);
        if (current()) {
          setWorkspace(next);
          if (resumedRunning && next && next.phase !== "running") {
            resumedRunning = false;
            setAttempt((value) => value + 1);
          }
        }
      } catch (failure) {
        if (current())
          setError("这项任务的本机进度暂不可用：" + taskStatusFailure(failure));
      } finally {
        polling = false;
      }
    };
    setBusy(true);
    void (async () => {
      try {
        const response =
          target.kind === "research"
            ? await researchApi("task", {
                params: { id: target.taskId },
                signal: controller.signal,
              })
            : await researchApi("personalWorkTask", {
                params: { id: target.taskId },
                signal: controller.signal,
              });
        if (!current()) return;
        const value = "task" in response.data ? response.data.task : response.data;
        if (value.id !== target.taskId || ("summaryOnly" in value && value.summaryOnly))
          throw Error("当前账号无法读取这项任务的工作背景。");
        setCanStage(
          target.kind === "research" &&
            value.allowedActions.some((action) => action === "submit"),
        );
        setBrief({
          title: value.title,
          goal:
            ("goal" in value && value.goal) ||
            ("summary" in value && value.summary) ||
            "",
        });
        if (!(await verifyService())) return;
        const bound = await bridge.taskOpen(target, false);
        if (!(await verifyService())) return;
        if (!bound) throw Error("任务工作区尚未连接，请重试。");
        setWorkspace(bound);
        if (bound.phase === "running") {
          resumedRunning = true;
          setConnectedScope(routeScope);
          if (materialId || nonce)
            setError("助手正在执行本轮工作；新增背景与资料会在本轮结束后接入。");
          if (recentKey)
            try {
              localStorage.setItem(recentKey, JSON.stringify(target));
            } catch {
              /* optional pointer */
            }
          return;
        }
        if (materialId && materialRevision) {
          const receipt = await bridge.taskImportTeamLibrary(target, {
            entryId: materialIds[0],
            entryIds: materialIds,
            revision: materialRevision,
            includeRules: params.get("teamRules") === "true",
          });
          if (!(await verifyService())) return;
          setMaterialReceipt(
            `已带入 ${receipt.count} 份资料 · ${receipt.revision.slice(0, 8)}`,
          );
        }
        if (!bridge.taskAttachContext)
          throw Error("当前客户端尚未支持自动接入任务背景，请更新客户端。");
        const actorScope = { memberId, labId, generation, serviceOrigin };
        const handoff = readNativeWorkbenchHandoff(nonce, actorScope, target);
        if (nonce && !handoff)
          throw Error("聊天交接已过期或不属于当前账号，请从原任务重新打开。");
        const attached = await bridge.taskAttachContext(target, handoff?.chat);
        if (!(await verifyService())) return;
        if (!attached?.binding.contextAttachment)
          throw Error("任务背景尚未获得接入回执，请重试。");
        setWorkspace(attached);
        setAttachedScope(routeScope);
        setConnectedScope(routeScope);
        clearNativeWorkbenchHandoff(nonce, actorScope, target);
        if (nonce || (materialId && materialRevision)) {
          const next = new URLSearchParams(params);
          for (const key of [
            "handoff",
            "teamEntry",
            "teamEntries",
            "teamRevision",
            "teamRules",
          ])
            next.delete(key);
          navigate("/dsh?" + next.toString(), { replace: true });
        }
        if (recentKey)
          try {
            localStorage.setItem(recentKey, JSON.stringify(target));
          } catch {
            /* optional pointer */
          }
      } catch (failure) {
        if (current())
          setError(
            failure instanceof Error ? failure.message : "任务背景暂未接上，请重试。",
          );
      } finally {
        initializing = false;
        if (current()) setBusy(false);
      }
    })();
    const timer = window.setInterval(() => void refresh(), 3500);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [bridge, routeScope, attempt]);

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
      } catch (failure) {
        if (alive.current)
          setError(
            failure instanceof Error ? failure.message : "无法读取本地服务状态。",
          );
      } finally {
        reading = false;
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 1200);
    return () => {
      alive.current = false;
      clearInterval(timer);
      void bridge.show(null).catch(() => {});
    };
  }, [bridge]);

  useEffect(() => {
    if (!bridge || !state?.pageReady || !seat.current) return;
    if (target && connectedScope !== routeScope) {
      void bridge.show(null).catch(() => {});
      return;
    }
    const element = seat.current;
    const resize = () => {
      const overlay = [
        ...document.querySelectorAll<HTMLElement>(
          ".ant-modal-wrap, .ant-drawer-open, .ant-popover:not(.ant-popover-hidden)",
        ),
      ].some(
        (node) =>
          node.getClientRects().length > 0 &&
          getComputedStyle(node).visibility !== "hidden",
      );
      if (overlay) {
        void bridge.show(null).catch(() => {});
        return;
      }
      const { x, y, width, height } = element.getBoundingClientRect();
      void bridge.show({ x, y, width, height }).catch(() => {});
    };
    const observer = new ResizeObserver(resize),
      overlays = new MutationObserver(resize);
    overlays.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    observer.observe(element);
    window.addEventListener("resize", resize);
    resize();
    return () => {
      observer.disconnect();
      overlays.disconnect();
      window.removeEventListener("resize", resize);
      void bridge.show(null).catch(() => {});
    };
  }, [bridge, state?.pageReady, connectedScope, routeScope, target?.taskId]);

  const reconnect = async () => {
    if (!bridge) return;
    const scope = routeScope;
    setBusy(true);
    setError("");
    try {
      const next = await bridge.start();
      if (alive.current && visibleScope.current === scope) {
        setState(next);
        setAttempt((value) => value + 1);
      }
    } catch (failure) {
      if (alive.current && visibleScope.current === scope)
        setError(failure instanceof Error ? failure.message : "连接失败，请重试。");
    } finally {
      if (alive.current && visibleScope.current === scope) setBusy(false);
    }
  };
  const reveal = async (name?: string) => {
    if (!bridge || !target) return;
    const scope = routeScope;
    try {
      await bridge.taskReveal(target, name);
    } catch (failure) {
      if (visibleScope.current === scope)
        setError(failure instanceof Error ? failure.message : "无法打开文件夹。");
    }
  };
  const takeSavedFiles = async () => {
    if (!bridge?.taskStageDelivery || !target || !canStage || busy) return;
    const scope = routeScope;
    setBusy(true);
    setError("");
    try {
      if (
        (await readWorkbenchServiceOrigin()) !== serviceOrigin ||
        visibleScope.current !== scope
      )
        return;
      const names = await bridge.taskStageDelivery(target);
      if (visibleScope.current === scope && names.length)
        navigate(workbenchTaskPath(target.taskId, target.kind));
    } catch (failure) {
      if (visibleScope.current === scope)
        setError(
          failure instanceof Error ? failure.message : "取回文件失败，请保存后重试。",
        );
    } finally {
      if (visibleScope.current === scope) setBusy(false);
    }
  };
  const sendInstruction = async () => {
    if (
      !instruction ||
      !instructionKey ||
      !bridge?.taskPrompt ||
      !target ||
      busy ||
      instructionFlight.current ||
      attachedScope !== routeScope ||
      workspace?.phase === "running"
    )
      return;
    const scope = routeScope;
    instructionFlight.current = true;
    setInstructionSending(true);
    setError("");
    try {
      if (
        (await readWorkbenchServiceOrigin()) !== serviceOrigin ||
        visibleScope.current !== scope
      )
        return;
      await bridge.taskPrompt(target, instruction.text, instruction.requestId);
      if (visibleScope.current !== scope) return;
      sessionStorage.removeItem(instructionKey);
      setInstruction(undefined);
      const next = await bridge.taskStatus(target);
      if (visibleScope.current === scope) setWorkspace(next);
    } catch (failure) {
      if (visibleScope.current === scope)
        setError(
          failure instanceof Error ? failure.message : "发送未完成，请重试原指令。",
        );
    } finally {
      if (visibleScope.current === scope) {
        instructionFlight.current = false;
        setInstructionSending(false);
      }
    }
  };
  const previousRun = connectedScope === routeScope && attachedScope !== routeScope;
  const receipt =
    attachedScope === routeScope || previousRun
      ? workspace?.binding.contextAttachment
      : undefined;
  const outputs = workbenchOutputs(workspace);
  const contextSummary = receipt?.entries
    .reduce<string[]>((summary, entry) => {
      const label = (
        {
          task: "任务背景",
          platform: "平台规则",
          rule: "适用规范",
          memory: "偏好",
          skill: "方法",
          source: "资料",
          link: "聊天来源",
          handoff: "交接",
        } as Record<string, string>
      )[entry.kind];
      if (label && !summary.includes(label)) summary.push(label);
      return summary;
    }, [])
    .join(" · ");
  return (
    <section className="local-dsh-page" aria-label="工作台">
      <header className="local-dsh-header">
        <h1 className="deepchat-brand"><img src={deepchatAvatar} alt="" />deepchat</h1>
        <nav aria-label="科研工作入口">
          {target && (
            <Link to={workbenchTaskPath(target.taskId, target.kind)}>
              {outputs.length ? `带 ${outputs.length} 份成果回任务` : "返回当前任务"}
            </Link>
          )}
          {canStage && (
            <Button
              disabled={busy || workspace?.phase === "running"}
              onClick={() => setSourcesOpen(true)}
            >
              取回已保存文件
            </Button>
          )}
          <Button onClick={() => setTasksOpen(true)}>任务与交付</Button>
          <Link to="/library" aria-label="前往共享资料">共享资料 <ExportOutlined aria-hidden /></Link>
        </nav>
      </header>
      {!bridge && (
        <Alert
          showIcon
          type="info"
          message="请使用支持本地 DSH 的 Windows 客户端"
          description="网页版及旧版客户端不能启动这台电脑上的 DSH。"
        />
      )}
      {(error || state?.error) && (
        <Alert
          showIcon
          type="error"
          message={error || state?.error}
          action={
            target && (
              <Button disabled={busy} onClick={() => setAttempt((value) => value + 1)}>
                重新接入
              </Button>
            )
          }
        />
      )}
      {target && (
        <div className="local-dsh-connected" aria-label="任务连接状态">
          <div className="local-dsh-connected-text">
            <strong>{brief?.title || "正在读取任务"}</strong>
            <span>
              {busy
                ? "正在接入任务背景…"
                : previousRun
                ? receipt
                  ? "正在执行 · 沿用本轮已有背景"
                  : "正在执行 · 本轮背景未记录"
                : receipt
                ? `已接上 · ${contextSummary}`
                : "任务背景尚未接上"}
            </span>
          </div>
          <Button
            size="small"
            disabled={!workspace && !instruction}
            onClick={() => setSourcesOpen(true)}
          >
            {instruction ? "查看指令草稿与来源" : "查看来源"}
          </Button>
        </div>
      )}
      <div ref={seat} className="local-dsh-seat">
        {state?.pageReady && target && connectedScope !== routeScope && (
          <div className="local-dsh-welcome">
            {busy ? (
              <>
                <Spin size="large" />
                <h2>正在接上这项任务</h2>
              </>
            ) : (
              <>
                <h2>任务背景尚未接上</h2>
                <p>核对上方原因后重新接入，继续使用这项任务原来的会话与文件夹。</p>
              </>
            )}
          </div>
        )}
        {!state?.pageReady && (
          <div className="local-dsh-welcome">
            {busy || state?.phase === "starting" || state?.phase === "stopping" ? (
              <>
                <Spin size="large" />
                <h2>{state ? labels[state.phase] : "正在读取状态"}</h2>
              </>
            ) : (
              <>
                <div className="local-dsh-monogram">DSH</div>
                <h2>让助手在本机开始工作</h2>
                <p>登录 AcceptCat 后自动连接内置 DSH，使用当前账号的默认模型。</p>
                {bridge && state && (
                  <Button
                    type="primary"
                    loading={busy}
                    onClick={() => void reconnect()}
                  >
                    重新连接
                  </Button>
                )}
                <div className="local-dsh-note">
                  <strong>本地工作区</strong>
                  <p>
                    会话和文件保存在这台电脑，并按 AcceptCat
                    账号分开。账号模型沿用「我的」中的配置。
                  </p>
                  <p>
                    模型调用经 AcceptCat 服务发送，工具在本机执行。退出账号或关闭
                    AcceptCat 会停止本地任务。
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <Drawer
        title="已接入的背景与来源"
        open={sourcesOpen}
        onClose={() => setSourcesOpen(false)}
        width={460}
        destroyOnClose
      >
        <div className="local-dsh-sources">
          {instruction && (
            <section aria-label="本次指令草稿">
              <h4>本次指令草稿</h4>
              <p>从团队资料带来的要求尚未发送。确认后发送到这项任务的 DSH 会话。</p>
              <Input.TextArea
                aria-label="本次指令草稿"
                readOnly
                value={instruction.text}
                autoSize={{ minRows: 3, maxRows: 8 }}
              />
              <Button
                type="primary"
                loading={instructionSending}
                disabled={
                  busy ||
                  instructionSending ||
                  attachedScope !== routeScope ||
                  workspace?.phase === "running"
                }
                onClick={() => void sendInstruction()}
              >
                发送到任务会话
              </Button>
            </section>
          )}
          {brief && (
            <>
              <h3>{brief.title}</h3>
              <p>{brief.goal}</p>
            </>
          )}
          {workspace && (
            <>
              <h4>继续工作的地方</h4>
              <p>
                会话：{workspace.binding.sessionTitle || workspace.binding.sessionId}
              </p>
              <p className="local-dsh-source-path">{workspace.binding.directory}</p>
              <Button onClick={() => void reveal()}>打开文件夹</Button>
            </>
          )}
          {receipt ? (
            <>
              <h4>
                {previousRun ? "本轮开始前接入" : "实际接入"} ·{" "}
                {new Date(receipt.createdAt).toLocaleString()}
              </h4>
              {!receipt.path.startsWith("session:") && (
                <p className="local-dsh-source-path">{receipt.path}</p>
              )}
              {receipt.entries.map((entry) => (
                <article key={`${entry.kind}:${entry.id}`}>
                  <strong>{entry.title}</strong>
                  <span>版本 {entry.version}</span>
                </article>
              ))}
              {receipt.omitted.length > 0 && (
                <p>未带入：{receipt.omitted.join("；")}</p>
              )}
            </>
          ) : (
            <p>尚无成功接入回执。返回工作台重试后核对来源。</p>
          )}
          {materialReceipt && <p>{materialReceipt}</p>}
          {(workspace?.binding.teamMaterialReceipts || []).map((material) => (
            <section key={`${material.repository}:${material.revision}`}>
              <h4>团队资料来源</h4>
              <p className="local-dsh-source-path">{material.repository}</p>
              <p className="local-dsh-source-path">已选版本：{material.revision}</p>
              {material.entries.map((entry) => (
                <article key={entry.id}>
                  <strong>{entry.name}</strong>
                  <span>SHA256 {entry.sha256.slice(0, 12)}</span>
                </article>
              ))}
            </section>
          ))}
          {canStage && (
            <>
              <h4>取回科研插件中的成果</h4>
              <p>
                先在科研插件中保存并下载「工作副本」，再选择下载的文件。所选副本会带回这项任务，等待你核对并确认交付。
              </p>
              <Button
                type="primary"
                loading={busy}
                disabled={busy || workspace?.phase === "running"}
                onClick={() => void takeSavedFiles()}
              >
                选择已保存的成果
              </Button>
            </>
          )}
          {(workspace?.binding.localMaterials || []).length > 0 && (
            <>
              <h4>本任务的材料副本</h4>
              {workspace!.binding.localMaterials!.map((file) => (
                <article key={file.localName}>
                  <strong>{file.filename}</strong>
                  <span>SHA256 {file.sha256.slice(0, 12)}</span>
                </article>
              ))}
            </>
          )}
          {outputs.length > 0 && (
            <>
              <h4>本机成果（待你核对）</h4>
              {outputs.map((file) => (
                <article key={file.name}>
                  <strong>{file.name}</strong>
                  <Button size="small" onClick={() => void reveal(file.name)}>
                    查看
                  </Button>
                </article>
              ))}
              <Link to={workbenchTaskPath(target!.taskId, target!.kind)}>
                回任务核对并交付
              </Link>
            </>
          )}
          <p>接入背景后，在 DSH 输入框继续提出要求。成果仍由你回到任务核对、提交。</p>
        </div>
      </Drawer>
      <Drawer
        title="任务与交付"
        rootClassName="local-dsh-task-drawer"
        rootStyle={{ top: 40 }}
        open={tasksOpen}
        onClose={() => setTasksOpen(false)}
        width={460}
        destroyOnClose
      >
        <p>查看安排和成果，进入任务后继续工作、提交或验收。</p>
        {tasksOpen && (
          <Suspense fallback={<Spin tip="正在读取任务" />}>
            <TaskInbox presentation="overview" />
          </Suspense>
        )}
      </Drawer>
    </section>
  );
}
