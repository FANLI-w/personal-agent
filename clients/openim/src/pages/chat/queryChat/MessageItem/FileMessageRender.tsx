import { MessageStatus } from "@openim/wasm-client-sdk";
import { Dropdown, type MenuProps } from "antd";
import {
  DownloadOutlined,
  FolderOpenOutlined,
  RobotOutlined,
  FileSearchOutlined,
} from "@ant-design/icons";
import { useEffect, useRef, useState } from "react";
import fileIcon from "@/assets/images/messageItem/file_icon.png";
import { bytesToSize } from "@/utils/common";
import { IMessageItemProps } from ".";
import styles from "./message-item.module.scss";
import { canReadSdkFile, useAgentFileReading } from "@/research/useAgentFileReading";
import {
  useAgentChatOperation,
  type AgentChatOperation,
} from "@/research/useAgentChatOperation";
import { useConversationStore, useUserStore } from "@/store";
import { useResearchStore } from "@/research/store";

// Virtualized history unmounts rows; keep only opaque, short-lived save records.
const savedFiles = new Map<string, { token: string; expires: number }>();

export default function FileMessageRender({
  message,
  messageMenu,
  disabled,
}: IMessageItemProps) {
  const [downloading, setDownloading] = useState(false),
    [error, setError] = useState("");
  const [saved, setSaved] = useState<string>();
  const [menuOpen, setMenuOpen] = useState(false);
  const file = message.fileElem;
  const reading = useAgentFileReading();
  const capture = useAgentChatOperation();
  const input = useRef<HTMLInputElement>(null);
  const intent = useRef<AgentChatOperation>();
  const transfer = useRef<AgentChatOperation>();
  const generation = useResearchStore((s) => s.generation);
  const currentID = useConversationStore((s) => s.currentConversation?.conversationID);
  const selfID = useUserStore((s) => s.selfInfo.userID);
  const saveKey = `${generation}:${selfID}:${currentID}:${message.clientMsgID}`;
  useResearchStore((s) => s.contacts);
  useResearchStore((s) => s.mappings);
  useEffect(() => {
    const record = savedFiles.get(saveKey);
    setSaved(record && record.expires > Date.now() ? record.token : undefined);
    setMenuOpen(false);
    setDownloading(false);
    setError("");
    return () => {
      intent.current?.dispose();
      transfer.current?.dispose();
    };
  }, [saveKey]);
  if (!file) throw new Error("文件消息缺少 fileElem");
  const unavailable =
    disabled || message.status === MessageStatus.Sending || !file.sourceUrl;
  const download = async () => {
    if (unavailable || downloading) return;
    const operation = capture();
    transfer.current = operation;
    const controller = new AbortController();
    const abort = () => controller.abort();
    operation.signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(() => controller.abort(), 60000);
    setDownloading(true);
    setError("");
    try {
      const url = new URL(file.sourceUrl);
      if (!["http:", "https:"].includes(url.protocol))
        throw new Error("下载地址不可用");
      const response = await fetch(url.href, {
        credentials: "omit",
        signal: controller.signal,
      });
      if (!response.ok || !response.body)
        throw new Error(`下载失败（${response.status}）`);
      const limit = 64 * 1024 * 1024;
      if (
        Number(response.headers.get("content-length")) > limit ||
        file.fileSize > limit
      )
        throw new Error("文件超过64MB，暂无法另存。");
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let count = 0;
      try {
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          count += result.value.length;
          if (count > limit) throw new Error("文件超过64MB，暂无法另存。");
          chunks.push(result.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      if (!operation.isCurrent()) return;
      clearTimeout(timeout);
      const blob = new Blob(chunks);
      if (window.electronAPI?.saveChatFile) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (!operation.isCurrent()) return;
        const result = await window.electronAPI.saveChatFile(file.fileName, bytes);
        if (operation.isCurrent() && result) {
          for (const [key, record] of savedFiles)
            if (record.expires < Date.now()) savedFiles.delete(key);
          if (savedFiles.size >= 128)
            savedFiles.delete(savedFiles.keys().next().value!);
          savedFiles.set(saveKey, {
            token: result.token,
            expires: Date.now() + 30 * 60 * 1000,
          });
          setSaved(result.token);
        }
      } else {
        const local = URL.createObjectURL(blob),
          link = document.createElement("a");
        link.href = local;
        link.download = file.fileName.replace(/[\\/]/g, "_");
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(local), 30000);
      }
    } catch (err) {
      if (operation.isCurrent())
        setError(err instanceof Error ? err.message : "文件下载失败");
    } finally {
      clearTimeout(timeout);
      operation.signal.removeEventListener("abort", abort);
      if (operation.isCurrent()) setDownloading(false);
      operation.dispose();
    }
  };
  const common = (messageMenu?.items || []).filter(
    (item) => item && (!("type" in item) || item.type !== "divider"),
  );
  const items: MenuProps["items"] = [
    ...common.filter((item) => item?.key !== "withdraw" && item?.key !== "delete"),
    ...(common.length ? [{ type: "divider" as const }] : []),
    ...(saved && window.electronAPI?.revealChatFile
      ? [{ key: "reveal", label: "在文件夹中显示", icon: <FolderOpenOutlined /> }]
      : []),
    {
      key: "save",
      label: window.electronAPI?.saveChatFile ? "另存为…" : "下载文件",
      icon: <DownloadOutlined />,
      disabled: unavailable || downloading,
    },
    ...(canReadSdkFile(message)
      ? [
          {
            key: "read",
            label: "让 Agent 阅读",
            icon: <RobotOutlined />,
            disabled: reading.busy || unavailable,
          },
          {
            key: "localRead",
            label: "从本机选择阅读…",
            icon: <FileSearchOutlined />,
            disabled: reading.busy || disabled,
          },
        ]
      : []),
    ...(common.length
      ? [
          { type: "divider" as const },
          ...common.filter(
            (item) => item?.key === "withdraw" || item?.key === "delete",
          ),
        ]
      : []),
  ];
  return (
    <>
      <Dropdown
        trigger={["contextMenu"]}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        overlayClassName="chat-message-menu"
        menu={{
          items,
          onClick: (info) => {
            setMenuOpen(false);
            if (info.key === "save") void download();
            else if (info.key === "reveal" && saved)
              void window.electronAPI
                ?.revealChatFile(saved)
                .catch((cause) => setError(cause.message || "无法显示文件"));
            else if (info.key === "read") void reading.readExisting(message);
            else if (info.key === "localRead") {
              intent.current?.dispose();
              intent.current = capture();
              input.current?.click();
            } else messageMenu?.onClick?.(info);
          },
        }}
      >
        <div
          className={`${styles.bubble} chat-file-card`}
          data-file-message
          role="button"
          tabIndex={0}
          aria-label={`文件 ${file.fileName}`}
          title="双击保存文件；右键查看消息操作"
          onContextMenu={(event) => event.stopPropagation()}
          onDoubleClick={() => void download()}
          onKeyDown={(event) => {
            if (
              event.key === "ContextMenu" ||
              (event.shiftKey && event.key === "F10")
            ) {
              event.preventDefault();
              setMenuOpen(true);
            } else if (event.key === "Enter") {
              event.preventDefault();
              void download();
            }
          }}
        >
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <strong className="block break-all">{file.fileName}</strong>
              <small>{bytesToSize(file.fileSize)}</small>
            </div>
            <img src={fileIcon} alt="" width={38} />
          </div>
          {downloading && <small role="status">正在下载…</small>}
          {saved && <small>已保存到本机</small>}
        </div>
      </Dropdown>
      <input
        ref={input}
        type="file"
        className="hidden"
        accept=".pdf,.txt,.md,.csv"
        onChange={(event) => {
          const selected = event.currentTarget.files?.[0],
            operation = intent.current;
          event.currentTarget.value = "";
          if (!selected || !operation?.isCurrent()) return;
          void reading
            .readExisting(message, selected, operation.isCurrent)
            .finally(() => operation.dispose());
        }}
      />
      {reading.controls}
      {error && (
        <div role="alert" className="text-xs text-red-700">
          {error}
        </div>
      )}
    </>
  );
}
