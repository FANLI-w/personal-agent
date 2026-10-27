import type { MessageItem } from "@openim/wasm-client-sdk";
import type { PreparedResearchSend } from "./ResearchComposer";
import { imagePasteLimits } from "@/types/imageClipboard";

export type ComposerImage = {
  id: string;
  name: string;
  size: number;
  mediaType: string;
  file?: File;
  message?: MessageItem;
  sent?: boolean;
  ocrText?: string;
};
type ImageSubmission = {
  id: string;
  text: string;
  images?: ComposerImage[];
  imageAgentConversationId?: string;
  request?: PreparedResearchSend;
};

export function assertImageQueueCapacity(
  images: ComposerImage[],
  queued: ImageSubmission[],
) {
  const all = [...images, ...queued.flatMap((item) => item.images || [])];
  if (
    all.length > imagePasteLimits.count ||
    all.reduce((sum, image) => sum + image.size, 0) > imagePasteLimits.totalBytes
  )
    throw new Error("待发图片较多，请先处理发送记录，再添加图片。");
}

/** Save each receipt before continuing: retries reuse SDK IDs and skip images
 * already acknowledged. Files stay in this account's in-memory outbox. */
export async function sendSubmissionImages(
  item: ImageSubmission,
  io: {
    isCurrent: () => boolean;
    makeImage: (file: File) => Promise<MessageItem>;
    sendImage: (message: MessageItem) => Promise<void>;
    recognize: (file: File) => Promise<string>;
    save: (patch: { images?: ComposerImage[]; request?: PreparedResearchSend }) => void;
  },
): Promise<PreparedResearchSend | undefined> {
  const images = item.images?.slice() || [];
  if (!images.length) return item.request;
  const current = () => {
    if (!io.isCurrent()) throw new Error("会话已切换，请回到原会话继续发送。");
  };
  current();
  const prepared = item.request?.route === "agentFileMessage";
  // Refresh must never silently turn an attachment submission into text only.
  if (
    images.some(
      (image) =>
        !image.file && (!image.sent || (!!item.imageAgentConversationId && !prepared)),
    )
  )
    throw new Error(
      "刷新后无法恢复待发原图，请先核对聊天记录，再重新选择图片发送。文字记录仍保留。",
    );
  const patch = (index: number, changes: Partial<ComposerImage>) => {
    images[index] = { ...images[index]!, ...changes };
    io.save({ images: images.slice() });
  };
  for (const [index, image] of images.entries()) {
    current();
    if (image.sent) continue;
    const message = image.message || (await io.makeImage(image.file!));
    patch(index, { message });
    current();
    await io.sendImage(message);
    patch(index, { sent: true });
    current();
  }
  if (!item.imageAgentConversationId || prepared) return item.request;
  for (const [index, image] of images.entries()) {
    current();
    if (image.ocrText !== undefined) continue;
    const text = await io.recognize(image.file!);
    current();
    if (!text.trim())
      throw new Error(
        `图片“${image.name}”未识别到文字。图片已发送；请换清晰原图，或补充说明。`,
      );
    patch(index, { ocrText: text });
  }
  current();
  const content =
    "以下是本轮图片在用户本机提取的文字，并非原图；不能据此声称看到了图表、物体或排版。\n\n" +
    images
      .map(
        (image, index) =>
          `--- 图片 ${index + 1}：${image.name.replace(/[\r\n]/g, " ")} ---\n${
            image.ocrText
          }`,
      )
      .join("\n\n");
  const bytes = new TextEncoder().encode(content);
  if (bytes.length > 10 * 1024 * 1024)
    throw new Error(
      "图片已发送，但提取的文字超过单次读取上限，请分批选择图片后再请求助手。",
    );
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  const request: PreparedResearchSend = {
    route: "agentFileMessage",
    conversationId: item.imageAgentConversationId,
    body: {
      filename: `图片文字-${item.id}.txt`,
      mediaType: "text/plain",
      contentBase64: btoa(binary),
      text:
        item.text ||
        "请根据这些图片中可识别的文字帮我看看内容；识别不清的地方请说明，不要补造图像细节。",
    },
  };
  io.save({ request });
  return request;
}
