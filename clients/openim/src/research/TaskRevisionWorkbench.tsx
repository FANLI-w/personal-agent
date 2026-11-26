import {
  CheckOutlined,
  CloseOutlined,
  DownOutlined,
  EditOutlined,
  ExportOutlined,
  EyeOutlined,
  FileExcelOutlined,
  FileOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  FolderOpenOutlined,
  MessageOutlined,
  OrderedListOutlined,
  PlusOutlined,
  SaveOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { Alert, Button, Modal, Popconfirm, Spin } from "antd";
import { useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import type {
  DshTaskState,
  TaskDocument,
  TaskTarget,
} from "../../../../integrations/deepseek-harness/desktop/task-workspace";
import type { LocalDshBridge } from "@/types/localDsh";
import { deliveryFilename } from "./task-delivery-command";
import { workbenchOutputs } from "./local-dsh-context";
import { taskStatusFailure } from "./task-status-read";
import SafeMessageMarkdown from "./SafeMessageMarkdown";
import "./task-revision-workbench.scss";

export type WorkbenchRevision = {
  comment: string;
  reviewer?: string;
  at?: string;
  version?: number;
  sources: { locator: string; label: string }[];
};

const isText = /\.(md|markdown|txt|csv|tsv|json)$/i;
const isMarkdown = /\.(md|markdown)$/i;
const isNativeDocument =
  /\.(md|markdown|txt|csv|tsv|json|docx|xlsx|pptx|pdf|png|jpe?g|webp|gif)$/i;
const isStaged = /^delivery-[a-f0-9]{64}[\\/]/i;
const summaryLimit = 8000;

function DocumentIcon({ name }: { name: string }) {
  if (/\.(xlsx?|csv|tsv)$/i.test(name))
    return <FileExcelOutlined aria-hidden className="document-excel" />;
  if (/\.pdf$/i.test(name))
    return <FilePdfOutlined aria-hidden className="document-pdf" />;
  if (/\.(md|markdown|docx?)$/i.test(name))
    return <FileWordOutlined aria-hidden className="document-word" />;
  return <FileOutlined aria-hidden />;
}

function hasMarkdownTitle(text: string) {
  let fence: string | undefined;
  for (const line of text.split("\n")) {
    if (fence) {
      if (line.trim().startsWith(fence)) fence = undefined;
      continue;
    }
    fence = /^\s{0,3}(```|~~~)([^\s]*)\s*$/.exec(line)?.[1];
    if (!fence && /^\s{0,3}#[ \t]+\S/.test(line)) return true;
  }
  return false;
}

function fileCopyLabels(
  paths: string[],
  filename: (path: string) => string,
  sourcePaths: Set<string>,
) {
  const byFilename = new Map<string, string[]>();
  for (const path of new Set(paths)) {
    const name = filename(path);
    const group = byFilename.get(name);
    if (group) group.push(path);
    else byFilename.set(name, [path]);
  }
  const copies = new Map<string, string>();
  for (const group of byFilename.values()) {
    if (group.length < 2) continue;
    const locations = group.sort().map((path) => {
      if (sourcePaths.has(path)) return "任务来源";
      if (isStaged.test(path)) return "交付快照";
      const folders = path.split(/[\\/]/).slice(0, -1);
      if (/^revision-[\w-]+-v\d+$/.test(folders[0] || "")) return "取回副本";
      if (/^work-[a-f0-9-]{36}$/i.test(folders[0] || "")) return "本机副本";
      return folders.length ? `子目录 ${folders.at(-1)}` : "工作文件夹";
    });
    const sameLocation = new Set(locations).size < locations.length;
    group.forEach((path, index) => {
      const location = locations[index];
      copies.set(path, sameLocation ? `${location} · 位置 ${index + 1}` : location);
    });
  }
  return copies;
}

function DocumentCaption({ filename, copy }: { filename: string; copy?: string }) {
  return (
    <span className="task-revision-file-caption">
      <span>{filename}</span>
      {copy && <small>{copy}</small>}
    </span>
  );
}

export function TaskRevisionWorkbench({
  bridge,
  target,
  title,
  revision,
  workspace,
  version,
  status,
  canSubmit,
  filesSupported,
  verified,
  refresh,
  onTasks,
  onTaskDetail,
  onAssistant,
  onResult,
}: {
  bridge: LocalDshBridge;
  target: TaskTarget;
  title: string;
  revision?: WorkbenchRevision;
  workspace: DshTaskState;
  version: number;
  status: string;
  canSubmit: boolean;
  filesSupported: boolean;
  verified: () => Promise<boolean>;
  refresh: () => Promise<void>;
  onTasks: () => void;
  onTaskDetail: () => void;
  onAssistant?: () => void;
  onResult: () => Promise<void>;
}) {
  const files = workspace.files;
  const outputs = workbenchOutputs(workspace);
  const inputs = [
    ...workspace.binding.sources,
    ...(workspace.binding.localMaterials || []),
  ];
  const label = (name: string) =>
    inputs.find((file) => file.localName === name)?.filename || deliveryFilename(name);
  const [tabs, setTabs] = useState<string[]>(() => {
    const initial =
      outputs.find((file) => isText.test(file.name) && !isStaged.test(file.name))
        ?.name ||
      outputs.find((file) => !isStaged.test(file.name))?.name ||
      files[0]?.name;
    return initial
      ? [
          initial,
          ...files
            .filter((file) => file.name !== initial && !isStaged.test(file.name))
            .slice(0, 2)
            .map((file) => file.name),
        ]
      : [];
  });
  const copies = fileCopyLabels(
    [...files.map((file) => file.name), ...tabs],
    label,
    new Set(inputs.map((file) => file.localName)),
  );
  const fileHint = (name: string) => {
    const copy = copies.get(name);
    return copy
      ? `${label(name)} · ${copy}\n工作文件夹 / ${name.replace(/\\/g, "/")}`
      : name;
  };
  const [active, setActive] = useState<string>(() => tabs[0] || "");
  const [loaded, setLoaded] = useState<TaskDocument & { name: string }>();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [fileError, setFileError] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<number>();
  const editor = useRef<HTMLTextAreaElement>(null);
  const flight = useRef(false);
  const alive = useRef(false);
  const readScope = useRef(verified);
  readScope.current = verified;
  const document = loaded?.name === active ? loaded : undefined;
  const dirty = Boolean(document && draft !== document.text);
  const blocker = useBlocker(dirty);
  const pending =
    workspace.binding.delivery?.status === "pending"
      ? workspace.binding.delivery
      : undefined;
  const sent =
    ["in_review", "awaiting_review"].includes(status) ||
    (receipt !== undefined && version <= receipt);
  const canEdit = canSubmit && workspace.phase !== "running" && !pending && !sent;
  const selectedOutput = outputs.find((file) => file.name === active);
  const canSend =
    canEdit &&
    filesSupported &&
    !loading &&
    !isStaged.test(active) &&
    Boolean(selectedOutput && (selectedOutput.size > 0 || (dirty && draft)));
  const body = document?.editable ? draft.trim() : "";
  const fullBody = body.length <= summaryLimit;
  const fileTitle =
    document &&
    (!isMarkdown.test(active) || !hasMarkdownTitle(editing ? document.text : draft)) ? (
      <h2 className="task-revision-document-title">
        {label(active).replace(/\.[^.]+$/, "")}
      </h2>
    ) : undefined;

  useEffect(() => {
    if (!dirty) return;
    const confirmLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", confirmLeave);
    return () => window.removeEventListener("beforeunload", confirmLeave);
  }, [dirty]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setLoaded(undefined);
    setDraft("");
    setEditing(false);
    setFileError("");
    setLoading(Boolean(active && isText.test(active)));
    if (!active || !isText.test(active)) return;
    void (async () => {
      try {
        if (!(await readScope.current()) || cancelled) return;
        const result = await bridge.taskReadDocument!(target, active);
        if (cancelled) return;
        setLoaded({ ...result, name: active });
        setDraft(result.text);
      } catch (failure) {
        if (!cancelled)
          setFileError(taskStatusFailure(failure, "暂时无法读取，稍后再试。"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, reload, bridge, target.taskId, target.kind]);

  const run = async (action: () => Promise<unknown>) => {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (await verified()) await action();
    } catch (failure) {
      if (alive.current)
        setMessage(taskStatusFailure(failure, "操作暂未完成，请重试。"));
    } finally {
      flight.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const save = async () => {
    if (!document || !dirty) return document;
    const result = await bridge.taskSaveDocument(
      target,
      active,
      draft,
      document.digest,
    );
    if (alive.current) {
      setLoaded({ ...result, name: active });
      setDraft(result.text);
    }
    return result;
  };
  const activate = (name: string) => {
    setTabs((current) => (current.includes(name) ? current : [...current, name]));
    setActive(name);
  };
  const open = (name: string) =>
    void run(async () => {
      if (active === name) return;
      await save();
      if (alive.current) activate(name);
    });
  const close = (name: string) =>
    void run(async () => {
      if (name === active) await save();
      if (!alive.current) return;
      const remaining = tabs.filter((item) => item !== name);
      setTabs(remaining);
      if (name === active)
        setActive(remaining[Math.max(0, tabs.indexOf(name) - 1)] || "");
    });
  const pick = () =>
    void run(async () => {
      await save();
      const added = await bridge.taskCopyWorkingDocument(target);
      if (!added || !alive.current) return;
      await refresh();
      if (alive.current) activate(added);
    });
  const restore = (locator: string) =>
    void run(async () => {
      await save();
      const name = await bridge.taskRestoreRevision(target, locator);
      if (!alive.current) return;
      await refresh();
      if (alive.current) activate(name);
    });
  const openNative = () =>
    void run(async () => {
      await save();
      if (isNativeDocument.test(active)) await bridge.taskOpenDocument(target, active);
      else await bridge.taskReveal(target, active);
    });
  const submit = (retry = false) =>
    void run(async () => {
      if (retry ? !pending : !canSend) return;
      const saved = await save();
      const summary = retry
        ? pending!.summary
        : body.slice(0, summaryLimit).replace(/[\uD800-\uDBFF]$/, "") ||
          `提交 1 个文件：${deliveryFilename(active)}`;
      try {
        await bridge.taskSubmit(
          target,
          summary,
          retry ? pending!.names : [active],
          retry ? undefined : saved?.digest,
        );
        if (alive.current) {
          setReceipt(version);
          setEditing(false);
        }
      } finally {
        if (alive.current) {
          try {
            await onResult();
          } catch {
            /* A separate read can be retried. */
          }
        }
      }
    });

  const format = (marker: string, lines = false) => {
    const input = editor.current;
    if (!input || busy) return;
    let start = input.selectionStart;
    let end = input.selectionEnd;
    if (lines) {
      start = start ? draft.lastIndexOf("\n", start - 1) + 1 : 0;
      const newline = draft.indexOf("\n", end);
      if (newline !== -1) end = newline;
      else end = draft.length;
    }
    const selected = draft.slice(start, end);
    const replacement = lines
      ? selected
          .split("\n")
          .map(
            (line, i) =>
              (marker === "1. " ? `${i + 1}. ` : marker) +
              line.replace(/^\s{0,3}(?:#{1,6}|[-*+]|\d+[.)])\s+/, ""),
          )
          .join("\n")
      : marker + selected + marker;
    setDraft(draft.slice(0, start) + replacement + draft.slice(end));
    window.requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(
        lines ? start : start + marker.length,
        lines ? start + replacement.length : start + marker.length + selected.length,
      );
    });
  };
  const saveAndLeave = (action: () => void) =>
    void run(async () => {
      await save();
      if (alive.current) action();
    });
  const canOpenNative =
    isNativeDocument.test(active) &&
    !inputs.some((file) => file.localName === active) &&
    !isStaged.test(active);
  const nativeLabel = canOpenNative ? "在本机应用中打开" : "在文件夹中查看";
  const leaveDisabled = busy || Boolean(dirty && !canEdit);

  return (
    <div className="task-revision-workbench">
      <aside className="task-revision-files" aria-label="任务文件">
        <h1>工作台</h1>
        <button
          className="task-revision-task"
          type="button"
          title={title}
          disabled={leaveDisabled}
          onClick={() => saveAndLeave(onTasks)}
        >
          <span>{title}</span>
          <DownOutlined aria-hidden />
        </button>
        <div className="task-revision-files-heading">
          <h2>任务文件</h2>
          {canEdit && (
            <Button
              type="text"
              icon={<PlusOutlined />}
              aria-label="添加本机工作副本"
              disabled={busy}
              onClick={pick}
            />
          )}
          <Button
            type="text"
            icon={<FolderOpenOutlined />}
            aria-label="打开工作文件夹"
            disabled={busy}
            onClick={() => void run(() => bridge.taskReveal(target))}
          />
        </div>
        <div className="task-revision-file-list">
          {files.map((file) => (
            <button
              key={file.name}
              type="button"
              aria-current={active === file.name ? "true" : undefined}
              title={fileHint(file.name)}
              disabled={busy}
              onClick={() => open(file.name)}
            >
              <DocumentIcon name={file.name} />
              <DocumentCaption
                filename={label(file.name)}
                copy={copies.get(file.name)}
              />
            </button>
          ))}
          {!files.length && <p>暂无本机文件</p>}
        </div>
        <div className="task-revision-sidebar-actions">
          {onAssistant && (
            <Button
              type="text"
              icon={<MessageOutlined />}
              disabled={leaveDisabled}
              onClick={() => saveAndLeave(onAssistant)}
            >
              打开工作助手
            </Button>
          )}
          <Button type="text" disabled={busy} onClick={onTaskDetail}>
            返回任务
          </Button>
        </div>
      </aside>
      <div className="task-revision-main">
        <header className="task-revision-top">
          <nav aria-label="已打开文件" className="task-revision-tabs">
            {tabs.map((name) => (
              <div
                className="task-revision-tab"
                data-active={active === name}
                key={name}
              >
                <button
                  type="button"
                  title={fileHint(name)}
                  aria-current={active === name ? "true" : undefined}
                  disabled={busy}
                  onClick={() => open(name)}
                >
                  <DocumentIcon name={name} />
                  <DocumentCaption filename={label(name)} copy={copies.get(name)} />
                </button>
                <Button
                  type="text"
                  size="small"
                  icon={<CloseOutlined />}
                  aria-label={["关闭", label(name), copies.get(name)]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={busy}
                  onClick={() => close(name)}
                />
              </div>
            ))}
            {canEdit && (
              <Button
                type="text"
                icon={<PlusOutlined />}
                aria-label="添加本机工作副本"
                disabled={busy}
                onClick={pick}
              />
            )}
          </nav>
          {pending?.versionConflict ? (
            <Button disabled={busy} onClick={onTaskDetail}>
              返回任务核对
            </Button>
          ) : pending ? (
            <Button loading={busy} onClick={() => submit(true)}>
              核对并重试
            </Button>
          ) : (
            <Popconfirm
              title={revision ? "提交修订稿供验收？" : "提交当前文件供验收？"}
              description={
                active && (
                  <>
                    <div>{label(active)}</div>
                    {!fullBody && <div>验收页将显示前 8000 字，全文可从附件查看。</div>}
                  </>
                )
              }
              okText="确认提交"
              cancelText="取消"
              disabled={!canSend || busy}
              onConfirm={() => submit()}
            >
              <Button type="primary" disabled={!canSend || busy} loading={busy}>
                {revision ? "提交修订稿" : "提交成果"}
              </Button>
            </Popconfirm>
          )}
        </header>
        {(message || sent || pending) && (
          <Alert
            showIcon
            type={message ? "error" : pending ? "warning" : "success"}
            message={
              message ||
              (pending?.versionConflict
                ? "提交时任务已被更新，请返回任务核对版本。"
                : pending
                ? "上次提交回执待核对"
                : "已提交，等待验收")
            }
          />
        )}
        <div className="task-revision-columns">
          <article className="task-revision-editor" aria-label="文件编辑区">
            <div className="task-revision-toolbar" aria-label="文件操作">
              {document?.editable && canEdit && (
                <>
                  <Button
                    type="text"
                    icon={
                      editing ? (
                        <EyeOutlined aria-hidden />
                      ) : (
                        <EditOutlined aria-hidden />
                      )
                    }
                    disabled={busy}
                    onClick={() => setEditing(!editing)}
                  >
                    {editing ? "预览" : "编辑"}
                  </Button>
                  <Button
                    type="text"
                    icon={<SaveOutlined aria-hidden />}
                    disabled={!dirty || busy}
                    onClick={() => void run(save)}
                  >
                    保存
                  </Button>
                </>
              )}
              {editing && isMarkdown.test(active) && canEdit && (
                <>
                  <Button
                    type="text"
                    disabled={busy}
                    onClick={() => format("# ", true)}
                  >
                    标题
                  </Button>
                  <Button
                    type="text"
                    disabled={busy}
                    aria-label="粗体"
                    onClick={() => format("**")}
                  >
                    <strong>B</strong>
                  </Button>
                  <Button
                    type="text"
                    disabled={busy}
                    aria-label="斜体"
                    onClick={() => format("*")}
                  >
                    <i>I</i>
                  </Button>
                  <Button
                    type="text"
                    disabled={busy}
                    icon={<UnorderedListOutlined />}
                    aria-label="项目列表"
                    onClick={() => format("- ", true)}
                  />
                  <Button
                    type="text"
                    disabled={busy}
                    icon={<OrderedListOutlined />}
                    aria-label="编号列表"
                    onClick={() => format("1. ", true)}
                  />
                </>
              )}
              {active && (
                <Button
                  type="text"
                  icon={<ExportOutlined aria-hidden />}
                  disabled={busy}
                  onClick={openNative}
                >
                  {nativeLabel}
                </Button>
              )}
              {document && (
                <Popconfirm
                  title="重新从本机读取文件？"
                  description="未保存的修改会被舍弃。"
                  disabled={!dirty}
                  onConfirm={() => setReload((value) => value + 1)}
                  okText="重新读取"
                  cancelText="取消"
                >
                  <Button
                    type="text"
                    disabled={busy}
                    onClick={dirty ? undefined : () => setReload((value) => value + 1)}
                  >
                    重新读取
                  </Button>
                </Popconfirm>
              )}
            </div>
            <div className="task-revision-paper">
              {fileTitle}
              {loading ? (
                <Spin />
              ) : document && editing && canEdit ? (
                <textarea
                  className={fileTitle ? "task-revision-draft-with-title" : undefined}
                  aria-label={`编辑 ${label(active)}`}
                  ref={editor}
                  value={draft}
                  disabled={busy}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      (event.ctrlKey || event.metaKey) &&
                      event.key.toLowerCase() === "s"
                    ) {
                      event.preventDefault();
                      void run(save);
                    }
                  }}
                />
              ) : document && isMarkdown.test(active) ? (
                <SafeMessageMarkdown text={draft} />
              ) : document ? (
                <pre>{draft}</pre>
              ) : active ? (
                <div className="task-revision-native">
                  <DocumentIcon name={active} />
                  <h3>{label(active)}</h3>
                  {fileError && <p>{fileError}</p>}
                  {fileError && (
                    <Button
                      disabled={busy}
                      onClick={() => setReload((value) => value + 1)}
                    >
                      重新读取
                    </Button>
                  )}
                  <Button
                    icon={<ExportOutlined aria-hidden />}
                    disabled={busy}
                    onClick={openNative}
                  >
                    {nativeLabel}
                  </Button>
                </div>
              ) : (
                <div className="task-revision-native">
                  <p>{files.length ? "选择文件查看" : "暂无文件可查看"}</p>
                  {canEdit && (
                    <Button icon={<PlusOutlined />} disabled={busy} onClick={pick}>
                      添加本机工作副本
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div className="task-revision-status" role="status">
              {document &&
                (dirty ? (
                  "有未保存修改"
                ) : (
                  <>
                    <CheckOutlined /> {document.editable && canEdit ? "已保存" : "只读"}
                  </>
                ))}
            </div>
          </article>
          <aside
            className="task-revision-feedback"
            aria-label={revision ? "本轮修改" : "任务来源"}
          >
            <h2>{revision ? "本轮修改" : "任务来源"}</h2>
            {revision && (
              <div className="task-revision-feedback-note">
                {(revision.reviewer || revision.at || revision.version) && (
                  <div>
                    {revision.reviewer && (
                      <>
                        <span aria-hidden className="task-revision-reviewer">
                          {Array.from(revision.reviewer).slice(0, 2).join("")}
                        </span>
                        <strong>{revision.reviewer}</strong>
                      </>
                    )}
                    {revision.at && (
                      <time dateTime={revision.at}>
                        {new Date(revision.at).toLocaleString()}
                      </time>
                    )}
                    {revision.version && <span>第 {revision.version} 版</span>}
                  </div>
                )}
                {revision.comment ? (
                  <SafeMessageMarkdown text={revision.comment} />
                ) : (
                  <p>本轮未附修改意见。</p>
                )}
              </div>
            )}
            {revision && revision.sources.length > 0 && (
              <div className="task-revision-sources">
                <h3>上一版交付</h3>
                {revision.sources.map((source) => (
                  <button
                    key={source.locator}
                    type="button"
                    title="取回到本机工作区"
                    disabled={busy || !canEdit}
                    onClick={() => restore(source.locator)}
                  >
                    <DocumentIcon name={source.label} />
                    <span>{source.label}</span>
                    <ExportOutlined aria-hidden />
                  </button>
                ))}
              </div>
            )}
            {inputs.length > 0 && (
              <div className="task-revision-sources">
                <h3>相关来源</h3>
                {inputs.map((file, index) => (
                  <button
                    key={`${file.localName}:${index}`}
                    type="button"
                    disabled={busy}
                    onClick={() => open(file.localName)}
                  >
                    <DocumentIcon name={file.filename} />
                    <span>{file.filename}</span>
                    <ExportOutlined aria-hidden />
                  </button>
                ))}
              </div>
            )}
            {!revision && !inputs.length && <p>暂无关联来源</p>}
          </aside>
        </div>
      </div>
      <Modal
        open={blocker.state === "blocked"}
        title="文稿有未保存的修改"
        closable={!busy}
        keyboard={!busy}
        maskClosable={!busy}
        onCancel={() => {
          if (!busy) blocker.reset?.();
        }}
        footer={[
          <Button key="stay" disabled={busy} onClick={() => blocker.reset?.()}>
            继续修改
          </Button>,
          <Button
            key="discard"
            danger
            disabled={busy}
            onClick={() => blocker.proceed?.()}
          >
            放弃修改
          </Button>,
          <Button
            key="save"
            type="primary"
            loading={busy}
            disabled={!canEdit}
            onClick={() =>
              void run(async () => {
                await save();
                blocker.proceed?.();
              })
            }
          >
            保存并离开
          </Button>,
        ]}
      >
        {message || "离开前可以把文稿保存到任务工作文件夹。"}
      </Modal>
    </div>
  );
}
