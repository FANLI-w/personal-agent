import type { FeishuPreview } from "@research-agent-platform/contracts";

let pending:
  | {
      nonce: string;
      actorId: string;
      generation: number;
      text: string;
      expires: number;
    }
  | undefined;
export function feishuDiscussionDraft(
  document: FeishuPreview,
  excerpt: string,
  sourceId?: string,
) {
  const selected = excerpt.trim();
  if (!selected || selected.length > 2200 || !document.content.includes(selected))
    throw new Error("请从预览中复制一段连续的原文，最多 2200 字符。");
  return [
    `我想和你讨论飞书文档「${document.title}」的这个片段。`,
    `来源：${document.sourceUrl}`,
    `飞书修订：${document.revision} · 读取于 ${document.readAt}`,
    sourceId && `DeepChat 私人副本：${sourceId}`,
    `所选原文片段（${selected.length} 字符）：\n<资料片段>\n${selected}\n</资料片段>`,
  ]
    .filter(Boolean)
    .join("\n");
}
// Only a nonce enters browser history. Material is one-use, memory-only and tied
// to the current authenticated actor and service/session generation.
export function stageFeishuPlanning(actorId: string, generation: number, text: string) {
  const nonce = crypto.randomUUID();
  pending = { nonce, actorId, generation, text, expires: Date.now() + 600000 };
  return nonce;
}
export function takeFeishuPlanning(
  nonce: unknown,
  actorId: string,
  generation: number,
) {
  const value = pending;
  pending = undefined;
  if (
    typeof nonce !== "string" ||
    !value ||
    value.nonce !== nonce ||
    value.actorId !== actorId ||
    value.generation !== generation ||
    value.expires < Date.now()
  )
    return;
  return value.text;
}
