import { CopyOutlined, ExportOutlined } from "@ant-design/icons";
import { Alert, Button, Input } from "antd";
import { useRef, useState } from "react";
import { useResearchRead } from "./useResearchRead";
import { researchApi } from "./api";
import { openFeishuLibrary } from "./feishu-library-link";
import { usePersonalOperation } from "./usePersonalOperation";

export function FeishuLibrarySource({ id, onAsk }: { id: string; onAsk: () => void }) {
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
        message="这个绑定已不可用，请重新读取集合或在对话中重新发送链接。"
      />
    );
  return (
    <section className="feishu-library-source" aria-label="飞书资料库">
      <FeishuLibraryActions
        key={id + library.sourceUrl}
        url={library.sourceUrl}
        onAsk={onAsk}
      />
      <p>{library.tableName} · 飞书多维表格 · 仅自己可见</p>
      <p>
        打开资料库可查看原表中的论文和附件；需要筛选、归纳或对比时，在下方和资料 Agent
        聊。
      </p>
      <details>
        <summary>连接与查询范围</summary>
        <p>原始资料在飞书维护，Agent 每次查询读取最新可读记录。</p>
        <p>
          {library.mapping.date
            ? "可按发表日期查询。"
            : library.mapping.year
            ? "当前只有年份，可按年度查询；精确的过去12个月需要发表日期字段。"
            : "尚未识别到年份或发表日期字段。"}
        </p>
        <p>已识别字段：{library.fields.map((f) => f.name).join("、")}</p>
        <p>没有复制全部论文或读取 PDF 附件；不会自动分享你的飞书权限。</p>
      </details>
    </section>
  );
}

function FeishuLibraryActions({ url, onAsk }: { url: string; onAsk: () => void }) {
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
        <Button
          onClick={() => {
            onAsk();
            setFeedback({
              error: false,
              message: "请在下方资料 Agent 输入问题并发送；这里不会自动发送查询。",
            });
          }}
        >
          去下方提问
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
