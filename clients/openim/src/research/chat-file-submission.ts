import type { MessageItem } from "@openim/wasm-client-sdk";
import type { PreparedResearchSend } from "./ResearchComposer";
import type { ComposerImage } from "./chat-image-submission";

type FileSubmission = {
  text: string;
  files?: (ComposerImage & { processed?: boolean })[];
  fileAgentConversationId?: string;
  request?: PreparedResearchSend;
};
const mediaTypes = {
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
} as const;

/** The existing Agent API accepts exactly one document per model request. */
export function assertAgentDocumentSelection(files: File[], imageCount: number) {
  if (files.length > 1 || (files.length && imageCount))
    throw new Error(
      "助手每条消息暂时只能读取一个文档，请保留一个文档后发送；图片请单独发送。输入和附件已保留。",
    );
}

/** Upload and reading share one outbox owner. Never fall through to a second,
 * text-only model request when preparing or submitting the file fails. */
export async function sendSubmissionFile(
  item: FileSubmission,
  io: {
    isCurrent: () => boolean;
    makeFile: (file: File) => Promise<MessageItem>;
    sendFile: (message: MessageItem) => Promise<void>;
    save: (patch: Pick<FileSubmission, "files" | "request">) => void;
  },
): Promise<PreparedResearchSend> {
  const current = () => {
    if (!io.isCurrent()) throw new Error("会话已切换，请回到原会话继续发送。");
  };
  current();
  if (!item.fileAgentConversationId || item.files?.length !== 1)
    throw new Error("助手每条消息暂时只能读取一个文档，请核对后重新选择文件。");
  let entry = item.files[0]!;
  const prepared =
    item.request?.route === "agentFileMessage" ? item.request : undefined;
  if (!entry.file && (!entry.sent || !prepared))
    throw new Error(
      "刷新后无法恢复待发原文件，请核对聊天记录后重新选择文件。文字记录已保留。",
    );
  const patch = (changes: Partial<typeof entry>) => {
    entry = { ...entry, ...changes };
    io.save({ files: [entry] });
  };
  if (!entry.sent) {
    const message = entry.message || (await io.makeFile(entry.file!));
    patch({ message });
    current();
    await io.sendFile(message);
    patch({ sent: true });
    current();
  }
  if (prepared) return prepared;
  const file = entry.file!;
  const mediaType =
    mediaTypes[file.name.split(".").at(-1)?.toLowerCase() as keyof typeof mediaTypes];
  if (!mediaType)
    throw new Error(
      "文件已发送；助手目前只支持含文字的 PDF、TXT、Markdown 和 CSV。尚未请求回复。",
    );
  if (file.size > 10 * 1024 * 1024)
    throw new Error(
      "文件已发送，但超过助手 10 MiB 读取上限，请拆分或减小文件。尚未请求回复。",
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  current();
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  const request: PreparedResearchSend = {
    route: "agentFileMessage",
    conversationId: item.fileAgentConversationId,
    body: {
      filename: file.name,
      mediaType,
      contentBase64: btoa(binary),
      ...(item.text ? { text: item.text } : {}),
    },
  };
  io.save({ request });
  return request;
}
