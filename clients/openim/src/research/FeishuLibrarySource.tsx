import { CommentOutlined, CopyOutlined, ExportOutlined } from "@ant-design/icons";
import { Alert, Button, Input } from "antd";
import type {
  FeishuLibrary,
  FeishuLibraryResult,
} from "@research-agent-platform/contracts";
import { useRef, useState } from "react";
import { useResearchRead } from "./useResearchRead";
import { researchApi, ResearchApiError } from "./api";
import { openFeishuLibrary } from "./feishu-library-link";
import { usePersonalOperation } from "./usePersonalOperation";

export function FeishuLibrarySource({
  id,
  scope,
  onDiscuss,
}: {
  id: string;
  scope: string;
  onDiscuss: (draft: string) => void;
}) {
  const read = useResearchRead(
    (signal) => researchApi("feishuLibraries", { signal }),
    "external-library:" + id,
  );
  const library = read.data?.data.find((s) => s.collectionId === id);
  if (read.error)
    return (
      <Alert
        type="warning"
        message={read.error}
        action={<Button onClick={read.refresh}>重试</Button>}
      />
    );
  if (!read.data) return <p role="status">正在读取资料库绑定…</p>;
  if (!library)
    return (
      <Alert
        type="warning"
        message="这个绑定已不可用，请重新读取集合或重新绑定飞书多维表格。"
      />
    );
  return (
    <section className="feishu-library-source" aria-label="飞书资料库">
      <FeishuLibraryActions
        key={library.sourceUrl}
        url={library.sourceUrl}
        onDiscuss={() =>
          onDiscuss(
            `我想和你讨论飞书资料库「${library.name}」中的数据表「${library.tableName}」。`,
          )
        }
      />
      <p>
        {library.tableName} · 飞书多维表格 ·{" "}
        {scope === "lab_shared" ? "课题组共享" : "仅自己可见"}
      </p>
      <FeishuLibraryQuery
        key={`${library.collectionId}:${library.version}`}
        library={library}
      />
    </section>
  );
}

function FeishuLibraryActions({
  url,
  onDiscuss,
}: {
  url: string;
  onDiscuss: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [showLink, setShowLink] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string }>();
  const operation = usePersonalOperation(true, "feishu-library-link:" + url);
  const locked = useRef(false);
  async function open() {
    if (locked.current) return;
    const { isCurrent } = operation.capture();
    if (!isCurrent()) return;
    locked.current = true;
    setBusy(true);
    setFeedback(undefined);
    try {
      await openFeishuLibrary(url);
      if (isCurrent())
        setFeedback({
          error: false,
          message:
            "已请求浏览器打开飞书资料库。若没有出现窗口，可复制链接到浏览器地址栏。",
        });
    } catch (error) {
      if (isCurrent()) {
        setShowLink(true);
        setFeedback({
          error: true,
          message:
            error instanceof Error
              ? error.message
              : "打开失败，请复制资料库链接到浏览器。",
        });
      }
    } finally {
      locked.current = false;
      if (isCurrent()) setBusy(false);
    }
  }
  async function copy() {
    const { isCurrent } = operation.capture();
    if (!isCurrent()) return;
    setShowLink(true);
    try {
      await navigator.clipboard.writeText(url);
      if (isCurrent())
        setFeedback({
          error: false,
          message: "资料库链接已复制，可粘贴到浏览器地址栏打开。",
        });
    } catch {
      if (isCurrent())
        setFeedback({
          error: true,
          message: "未能自动复制，请选中下面的链接，按 Ctrl+C 复制到浏览器地址栏。",
        });
    }
  }
  return (
    <>
      <div className="research-library-actions">
        <Button
          type="primary"
          icon={<ExportOutlined />}
          loading={busy}
          onClick={() => void open()}
        >
          在飞书打开资料库
        </Button>
        <Button icon={<CopyOutlined />} onClick={() => void copy()}>
          复制链接
        </Button>
        <Button icon={<CommentOutlined aria-hidden="true" />} onClick={onDiscuss}>
          和个人助理讨论
        </Button>
      </div>
      {feedback && (
        <p
          className={
            feedback.error ? "research-download-error" : "research-library-muted"
          }
          role={feedback.error ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      )}
      {showLink && (
        <Input
          aria-label="飞书资料库链接"
          value={url}
          readOnly
          onFocus={(event) => event.target.select()}
        />
      )}
    </>
  );
}

function FeishuLibraryQuery({ library }: { library: FeishuLibrary }) {
  const operation = usePersonalOperation(
    true,
    `feishu-library-query:${library.collectionId}`,
  );
  const running = useRef(false);
  const previousQuestion = useRef<string>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [result, setResult] = useState<FeishuLibraryResult>();
  async function query(value: string) {
    const question = value.trim();
    const { isCurrent } = operation.capture();
    if (!question || running.current || !isCurrent()) return;
    running.current = true;
    setBusy(true);
    setFailure("");
    setResult(undefined);
    try {
      const response = await researchApi("queryFeishuLibrary", {
        body: {
          collectionId: library.collectionId,
          question,
          ...(previousQuestion.current
            ? { previousQuestion: previousQuestion.current }
            : {}),
        },
      });
      if (!isCurrent()) return;
      previousQuestion.current = response.data.contextQuestion;
      setResult(response.data);
    } catch (error) {
      if (!isCurrent()) return;
      setFailure(
        error instanceof ResearchApiError && error.code === "FEISHU_REAUTHORIZE"
          ? "飞书需要重新授权。请从“绑定飞书多维表格”重新授权后再查询。"
          : error instanceof Error
          ? error.message
          : "查询失败，请重试。",
      );
    } finally {
      running.current = false;
      if (isCurrent()) setBusy(false);
    }
  }
  return (
    <details className="feishu-library-query">
      <summary>查询飞书表格记录</summary>
      <Input.Search
        aria-label="查询飞书表格记录"
        placeholder="例如：2026 年 CCF A 论文"
        enterButton="查询"
        loading={busy}
        maxLength={8000}
        onSearch={(value) => void query(value)}
      />
      {failure && <Alert type="warning" message={failure} />}
      {result?.state === "clarification" && (
        <Alert type="info" message={result.clarification} />
      )}
      {result?.state === "results" && (
        <>
          <p role="status">
            已读取 {result.scanned} 条，匹配 {result.matched} 条
            {result.complete ? "" : "（仅覆盖已读范围）"}。
          </p>
          {!!result.conditions.length && <p>{result.conditions.join(" · ")}</p>}
          <ul>
            {result.records.map((record) => (
              <li key={record.id}>
                <strong>{record.title}</strong>
                <p>
                  {[record.authors, record.venue, record.year, record.grade]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {record.abstract && <p>{record.abstract}</p>}
              </li>
            ))}
          </ul>
          {result.limitations.map((limit) => (
            <p key={limit}>{limit}</p>
          ))}
        </>
      )}
    </details>
  );
}
