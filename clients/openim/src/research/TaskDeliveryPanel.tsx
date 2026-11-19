import {
  CloudUploadOutlined,
  MessageOutlined,
  PaperClipOutlined,
} from "@ant-design/icons";
import { Alert, Button, Input } from "antd";
import { useRef, useState } from "react";
import type { TaskTarget } from "../../../../integrations/deepseek-harness/desktop/task-workspace";
import { taskDeliveryAction, taskDeliveryMode } from "./task-delivery-mode";

import {
  deliveryFilename as filename,
  deliveryFileDetails,
  deliveryReceiptLabel,
  maxTaskDeliveryFiles,
  prepareTaskDelivery,
} from "./task-delivery-command";
export function TaskDeliveryPanel({
  target,
  title,
  outputs,
  disabled,
  submit,
  stage,
  revealFile,
  submitted,
  pending,
  retry,
  currentStatus = "",
  canSubmit = true,
  filesSupported = true,
}: {
  target: TaskTarget;
  title: string;
  outputs: { name: string; size: number }[];
  disabled: boolean;
  submit: (names: string[], summary?: string) => Promise<void>;
  stage: (paths?: string[]) => Promise<string[]>;
  revealFile?: (name: string) => void;
  submitted?: { names: string[]; status: string; summary: string };
  pending?: boolean;
  retry: () => Promise<void>;
  currentStatus?: string;
  canSubmit?: boolean;
  filesSupported?: boolean;
}) {
  const filesAllowed = filesSupported && taskDeliveryMode(target.kind) === "files";
  const [over, setOver] = useState(false),
    [assistant, setAssistant] = useState(false);
  const [resultText, setResultText] = useState("");
  const [text, setText] = useState(""),
    [selection, setSelection] = useState<string[]>([]);
  const [attached, setAttached] = useState<string[]>([]);
  const [alternatives, setAlternatives] = useState<string[][]>([]);
  const [question, setQuestion] = useState(""),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const flight = useRef(false);
  const run = async (label: string, action: () => Promise<void>) => {
    if (flight.current || disabled || !canSubmit) return;
    flight.current = true;
    setBusy(true);
    setBusyLabel(label);
    setError("");
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "提交未完成，请重试。");
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };
  const resetQuestion = () => {
    setQuestion("");
    setAlternatives([]);
  };
  const selectFiles = (names: string[]) => {
    if (names.length > maxTaskDeliveryFiles) {
      setError("每次最多提交 5 份文件，请移除后再添加。");
      return false;
    }
    setSelection(names);
    setError("");
    return true;
  };
  const toggleFile = (name: string) => {
    if (selection.includes(name)) {
      if (selectFiles(selection.filter((file) => file !== name))) {
        setAttached(attached.filter((file) => file !== name));
      }
    } else {
      selectFiles([...selection, name]);
    }
    resetQuestion();
  };
  const fileDetails = (name: string) =>
    deliveryFileDetails(name, outputs.find((file) => file.name === name)?.size);
  const renderFile = (name: string) => (
    <span className="task-delivery-file-identity">
      <strong>{filename(name)}</strong>
      <small>{fileDetails(name)}</small>
    </span>
  );
  const renderReveal = (name: string) =>
    revealFile && (
      <Button
        type="text"
        size="small"
        disabled={disabled || busy}
        aria-label={`在文件夹中查看 ${filename(name)} · ${fileDetails(name)}`}
        onClick={() => revealFile(name)}
      >
        在文件夹中查看
      </Button>
    );
  const choose = async (paths?: string[]) => {
    if (!filesAllowed) return;
    await run("正在准备文件…", async () => {
      const names = await stage(paths && [...new Set(paths)]);
      if (!names.length) return;
      const nextAttached = [...new Set([...attached, ...names])];
      const nextSelection = [...new Set([...selection, ...names])];
      if (selectFiles(nextSelection)) {
        setAttached(nextAttached);
        resetQuestion();
      }
    });
  };
  const prepare = () => {
    if (!filesAllowed || disabled || busy || !canSubmit) return;
    const result = prepareTaskDelivery(
      text,
      title,
      outputs.map((file) => file.name),
      attached,
    );
    selectFiles(result.names);
    setAlternatives(result.alternatives || []);
    setQuestion(result.question);
  };
  return (
    <section className="task-delivery" aria-label={taskDeliveryAction(target.kind)}>
      {pending && (
        <Alert
          type="warning"
          message="上次提交回执待核对"
          action={
            <Button
              loading={busy}
              disabled={busy}
              onClick={() => {
                // This only replays the recorded intent. The main process checks
                // its exact contents and current authority even after submission.
                if (flight.current || busy || !pending) return;
                flight.current = true;
                setBusy(true);
                setBusyLabel("正在核对提交回执…");
                setError("");
                void retry()
                  .catch((failure) =>
                    setError(failure instanceof Error ? failure.message : "请重试。"),
                  )
                  .finally(() => {
                    flight.current = false;
                    setBusy(false);
                  });
              }}
            >
              核对并重试
            </Button>
          }
        />
      )}
      {!filesSupported && canSubmit && (
        <Alert
          type="info"
          message="当前后台尚未支持个人任务文件交付，请升级配套后台；仍可提交文字成果。"
        />
      )}
      {canSubmit && (
        <div className="task-delivery-header">
          <div>
            <h3>交付成果</h3>
            <p>
              {!filesAllowed
                ? "本任务支持文字成果"
                : "文件会提交到这项任务，负责人可直接下载"}
            </p>
          </div>
          {filesAllowed && canSubmit && (
            <Button
              icon={<MessageOutlined />}
              disabled={disabled || busy}
              aria-expanded={assistant}
              onClick={() => setAssistant((value) => !value)}
            >
              让助理帮我交
            </Button>
          )}
        </div>
      )}
      {filesAllowed && canSubmit && (
        <div
          className={"task-delivery-drop" + (over ? " is-over" : "")}
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled && !busy) setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setOver(false);
            if (disabled || busy || !canSubmit) return;
            const paths = Array.from(event.dataTransfer.files)
              .map((file) => window.electronAPI?.getFilePath(file))
              .filter((value): value is string => Boolean(value));
            if (!paths.length) {
              setError("请从电脑拖入文件，或点选择文件。");
              return;
            }
            void choose(paths);
          }}
        >
          <CloudUploadOutlined aria-hidden />
          <div>
            <strong>拖入要交付的文件</strong>
            <small>
              已选 {selection.length} / {maxTaskDeliveryFiles} 份 · 单份 512 MiB
            </small>
          </div>
          <Button
            type="primary"
            disabled={disabled || busy}
            onClick={() => void choose()}
          >
            选择文件
          </Button>
        </div>
      )}
      {filesAllowed && canSubmit && outputs.length > 0 && (
        <details className="task-delivery-output-options">
          <summary>从工作文件夹选择（{outputs.length}）</summary>
          <div className="task-delivery-choices">
            {outputs.map((file) => (
              <Button
                key={file.name}
                aria-pressed={selection.includes(file.name)}
                disabled={disabled || busy}
                onClick={() => toggleFile(file.name)}
              >
                {renderFile(file.name)}
              </Button>
            ))}
          </div>
          {outputs.length <= maxTaskDeliveryFiles && (
            <Button
              disabled={disabled || busy}
              onClick={() => {
                if (
                  selectFiles([
                    ...new Set([...selection, ...outputs.map((file) => file.name)]),
                  ])
                )
                  resetQuestion();
              }}
            >
              选择全部产出
            </Button>
          )}
        </details>
      )}
      {target.kind === "personal" && canSubmit && (
        <div className="task-delivery-text">
          <Input.TextArea
            aria-label="提交文字成果"
            value={resultText}
            rows={3}
            maxLength={8000}
            onChange={(event) => setResultText(event.target.value)}
            placeholder="写下成果，或粘贴结果"
            disabled={disabled || busy}
          />
          <Button
            type="primary"
            disabled={disabled || busy || !canSubmit || !resultText.trim()}
            loading={busy}
            onClick={() =>
              void run("正在提交，等待回执…", async () => {
                await submit([], resultText.trim());
                setResultText("");
              })
            }
          >
            提交文字成果
          </Button>
        </div>
      )}
      {assistant && canSubmit && (
        <div className="task-delivery-assistant">
          <Input.Search
            aria-label="告诉助理要提交哪份文件"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setSelection([]);
              resetQuestion();
            }}
            placeholder="把组会报告.pdf交到这项任务"
            enterButton="帮我准备"
            onSearch={prepare}
            disabled={disabled || busy}
          />
          <Button
            icon={<PaperClipOutlined />}
            disabled={disabled || busy}
            onClick={() => void choose()}
          >
            附上文件
          </Button>
          {question && (
            <p role="status" className="task-delivery-assistant-question">
              {question}
            </p>
          )}
          {alternatives.map((names) => (
            <div
              className="task-delivery-choices"
              key={names[0]}
              aria-label={filename(names[0])}
            >
              {names.map((name) => (
                <div className="task-delivery-choice" key={name}>
                  <Button
                    disabled={disabled || busy}
                    onClick={() => {
                      if (!selectFiles([...new Set([...selection, name])])) return;
                      const remaining = alternatives.filter((group) => group !== names);
                      setAlternatives(remaining);
                      if (!remaining.length) setQuestion("");
                    }}
                  >
                    {renderFile(name)}
                  </Button>
                  {renderReveal(name)}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {filesAllowed && (selection.length > 0 || attached.length > 0) && canSubmit && (
        <div className="task-delivery-confirm">
          <strong>{selection.length ? `提交到「${title}」` : "已附上的文件"}</strong>
          {(selection.length ? selection : attached).map((name) => (
            <div className="task-delivery-selected-file" key={name}>
              {renderFile(name)}
              {renderReveal(name)}
              <Button
                type="text"
                size="small"
                disabled={disabled || busy}
                aria-label={`移除 ${filename(name)} · ${fileDetails(name)}`}
                onClick={() => {
                  setAttached(attached.filter((file) => file !== name));
                  selectFiles(selection.filter((file) => file !== name));
                }}
              >
                移除
              </Button>
            </div>
          ))}
          {selection.length > 0 && !alternatives.length && (
            <Button
              type="primary"
              loading={busy}
              disabled={disabled || !canSubmit}
              onClick={() =>
                void run("正在提交，等待回执…", async () => {
                  await submit(selection);
                  setSelection([]);
                  setAttached([]);
                  setText("");
                })
              }
            >
              确认提交
            </Button>
          )}
          <Button
            onClick={() => {
              setSelection([]);
              setAttached([]);
              setError("");
              resetQuestion();
            }}
            disabled={busy}
          >
            先不交
          </Button>
        </div>
      )}
      {busy && <p role="status">{busyLabel || "正在核对提交回执…"}</p>}
      {error && <Alert type="error" message={error} />}
      {submitted?.status === "submitted" && (
        <div className="task-work-submitted" role="status">
          <strong>{deliveryReceiptLabel(currentStatus)}</strong>
          {!submitted.names.length && <p>{submitted.summary}</p>}
          {submitted.names.map((name) => (
            <p key={name}>{filename(name)}</p>
          ))}
        </div>
      )}
    </section>
  );
}
