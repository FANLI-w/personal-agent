import {
  CloudUploadOutlined,
  MessageOutlined,
  PaperClipOutlined,
} from "@ant-design/icons";
import { Alert, Button, Input } from "antd";
import { useRef, useState } from "react";
import type { TaskTarget } from "../../../../integrations/deepseek-harness/desktop/task-workspace";

import {
  deliveryFilename as filename,
  deliveryReceiptLabel,
  prepareTaskDelivery,
} from "./task-delivery-command";
export function TaskDeliveryPanel({
  target,
  title,
  outputs,
  disabled,
  submit,
  stage,
  submitted,
  pending,
  retry,
  currentStatus = "",
  canSubmit = true,
}: {
  target: TaskTarget;
  title: string;
  outputs: { name: string; size: number }[];
  disabled: boolean;
  submit: (names: string[], summary?: string) => Promise<void>;
  stage: (paths?: string[]) => Promise<string[]>;
  submitted?: { names: string[]; status: string; summary: string };
  pending?: boolean;
  retry: () => Promise<void>;
  currentStatus?: string;
  canSubmit?: boolean;
}) {
  const [over, setOver] = useState(false),
    [assistant, setAssistant] = useState(false);
  const [text, setText] = useState(""),
    [selection, setSelection] = useState<string[]>([]);
  const [attached, setAttached] = useState<string[]>([]);
  const [question, setQuestion] = useState(""),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const flight = useRef(false);
  const run = async (action: () => Promise<void>) => {
    if (flight.current || disabled) return;
    flight.current = true;
    setBusy(true);
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
  const choose = async (paths?: string[], direct = true) =>
    run(async () => {
      const names = await stage(paths);
      if (!names.length) return;
      if (direct) await submit(names);
      else {
        setAttached(names);
        setSelection(names);
        setQuestion("");
      }
    });
  const prepare = () => {
    const result = prepareTaskDelivery(
      text,
      title,
      outputs.map((file) => file.name),
      attached,
    );
    setSelection(result.names);
    setQuestion(result.question);
  };
  return (
    <section className="task-delivery" aria-label="提交文件">
      {pending && (
        <Alert
          type="warning"
          message="上次提交回执待核对"
          action={
            <Button
              loading={busy}
              onClick={() => {
                if (busy) return;
                setBusy(true);
                setError("");
                void retry()
                  .catch((failure) =>
                    setError(failure instanceof Error ? failure.message : "请重试。"),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              核对并重试
            </Button>
          }
        />
      )}
      <div className="task-delivery-header">
        <div>
          <h3>交付材料</h3>
          <p>
            {target.kind === "personal"
              ? "本任务支持文字成果"
              : "文件会提交到这项任务，负责人可直接下载"}
          </p>
        </div>
        {target.kind === "research" && (
          <Button
            icon={<MessageOutlined />}
            onClick={() => setAssistant((value) => !value)}
          >
            让助理帮我交
          </Button>
        )}
      </div>
      {target.kind === "personal" && (!submitted || canSubmit) && (
        <div className="task-delivery-text">
          <Input.TextArea
            aria-label="提交文字成果"
            value={text}
            rows={3}
            maxLength={8000}
            onChange={(event) => setText(event.target.value)}
            placeholder="写下成果，或粘贴结果"
            disabled={disabled || busy}
          />
          <Button
            type="primary"
            disabled={disabled || busy || !text.trim()}
            loading={busy}
            onClick={() =>
              void run(async () => {
                await submit([], text.trim());
                setText("");
              })
            }
          >
            提交成果
          </Button>
        </div>
      )}
      {target.kind === "research" && (
        <div
          className={"task-delivery-drop" + (over ? " is-over" : "")}
          onDragOver={(event) => {
            event.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setOver(false);
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
          <h3>{busy ? "正在提交文件…" : "把文件拖到这里，就交好了"}</h3>
          <Button
            type="primary"
            disabled={disabled || busy}
            onClick={() => void choose()}
          >
            选择文件并提交
          </Button>
          <small>每次最多 5 份，单份最大 512 MiB</small>
        </div>
      )}
      {assistant && (
        <div className="task-delivery-assistant">
          <Input.Search
            aria-label="告诉助理要提交哪份文件"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setSelection([]);
              setQuestion("");
            }}
            placeholder="把组会报告.pdf交到这项任务"
            enterButton="帮我准备"
            onSearch={prepare}
            disabled={disabled || busy}
          />
          <Button
            icon={<PaperClipOutlined />}
            disabled={disabled || busy}
            onClick={() => void choose(undefined, false)}
          >
            附上文件
          </Button>
          {attached.length > 0 && (
            <p>
              已附上 {attached.map(filename).join("、")}{" "}
              <Button
                size="small"
                type="text"
                disabled={busy}
                onClick={() => {
                  setAttached([]);
                  setSelection([]);
                }}
              >
                移除
              </Button>
            </p>
          )}
          {question && <p role="status">{question}</p>}
          {!!question &&
            !/先不提交/.test(question) &&
            outputs.slice(0, 20).map((file) => (
              <Button
                key={file.name}
                onClick={() => {
                  setSelection([file.name]);
                  setQuestion("");
                }}
              >
                {filename(file.name)}
              </Button>
            ))}
          {selection.length > 0 && (
            <div className="task-delivery-confirm">
              <strong>提交到「{title}」</strong>
              {selection.map((name) => (
                <p key={name}>{filename(name)}</p>
              ))}
              <Button
                type="primary"
                loading={busy}
                disabled={disabled}
                onClick={() =>
                  void run(async () => {
                    await submit(selection);
                    setSelection([]);
                    setAttached([]);
                    setText("");
                  })
                }
              >
                确认提交
              </Button>
              <Button onClick={() => setSelection([])} disabled={busy}>
                先不交
              </Button>
            </div>
          )}
        </div>
      )}
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
