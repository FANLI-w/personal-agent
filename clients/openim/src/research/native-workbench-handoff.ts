import { Id } from "@research-agent-platform/contracts";
import type { researchApi } from "./api";
import { nativeWorkbenchTaskPath, type WorkbenchTaskKind } from "./workbench-links";
import { contactServiceOrigin, readContactServiceOrigin } from "./contact-card";

export type WorkbenchActorScope = {
  memberId: string;
  labId: string;
  generation: number;
  serviceOrigin: string;
};
export type WorkbenchTarget = { taskId: string; kind: WorkbenchTaskKind };
export type WorkbenchMessageSource = { conversationId: string; messageId: string };
export type WorkbenchChatContext = {
  messages: Array<WorkbenchMessageSource & { turnId?: string; text: string }>;
};
export type NativeWorkbenchHandoff = {
  version: 1;
  actor: WorkbenchActorScope;
  target: WorkbenchTarget;
  chat?: WorkbenchChatContext;
  createdAt: number;
};
type HandoffStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const prefix = "native-workbench-handoff:";
const lifetime = 15 * 60 * 1000;
const validId = (value: unknown): value is string => Id.safeParse(value).success;
const validTarget = (value: WorkbenchTarget) =>
  validId(value?.taskId) && ["personal", "research"].includes(value.kind);
const validActor = (value: WorkbenchActorScope) => {
  try {
    return (
      validId(value?.memberId) &&
      validId(value.labId) &&
      Number.isSafeInteger(value.generation) &&
      value.generation >= 0 &&
      typeof value.serviceOrigin === "string" &&
      contactServiceOrigin(value.serviceOrigin) === value.serviceOrigin
    );
  } catch {
    return false;
  }
};

/** Electron's renderer origin is temporary; namespace navigation by the connected service. */
export async function readWorkbenchServiceOrigin() {
  try {
    return await readContactServiceOrigin();
  } catch {
    throw Error("工作台服务地址暂不可用，请连接科研服务后重试。");
  }
}
function validChat(chat: WorkbenchChatContext | undefined) {
  return (
    chat === undefined ||
    (!!chat &&
      Array.isArray(chat.messages) &&
      chat.messages.length > 0 &&
      chat.messages.length <= 2 &&
      chat.messages.every(
        (message) =>
          validId(message?.conversationId) &&
          validId(message.messageId) &&
          (message.turnId === undefined || validId(message.turnId)) &&
          typeof message.text === "string" &&
          !!message.text.trim() &&
          message.text.length <= 32000,
      ))
  );
}

/** Short-lived navigation data. The desktop bridge must reauthorize its contents. */
export function storeNativeWorkbenchHandoff(
  actor: WorkbenchActorScope,
  target: WorkbenchTarget,
  chat?: WorkbenchChatContext,
  storage: HandoffStorage = sessionStorage,
  mode?: "assistant",
) {
  if (!validActor(actor) || !validTarget(target) || !validChat(chat))
    throw Error("工作台上下文无效，请重新打开任务。");
  const nonce = crypto.randomUUID();
  const value: NativeWorkbenchHandoff = {
    version: 1,
    actor,
    target,
    chat,
    createdAt: Date.now(),
  };
  storage.setItem(prefix + nonce, JSON.stringify(value));
  return {
    nonce,
    path:
      nativeWorkbenchTaskPath(target.taskId, target.kind, mode) +
      "&handoff=" +
      encodeURIComponent(nonce),
  };
}

export function readNativeWorkbenchHandoff(
  nonce: string | null,
  actor: WorkbenchActorScope,
  target: WorkbenchTarget,
  storage: HandoffStorage = sessionStorage,
): NativeWorkbenchHandoff | undefined {
  if (!validId(nonce) || !validActor(actor) || !validTarget(target)) return;
  try {
    const value: NativeWorkbenchHandoff = JSON.parse(
      storage.getItem(prefix + nonce) || "null",
    );
    if (
      !value ||
      value.version !== 1 ||
      !validActor(value.actor) ||
      !validTarget(value.target) ||
      !validChat(value.chat) ||
      value.actor.memberId !== actor.memberId ||
      value.actor.labId !== actor.labId ||
      value.actor.generation !== actor.generation ||
      value.actor.serviceOrigin !== actor.serviceOrigin ||
      value.target.taskId !== target.taskId ||
      value.target.kind !== target.kind ||
      !Number.isFinite(value.createdAt) ||
      value.createdAt > Date.now() ||
      Date.now() - value.createdAt > lifetime
    )
      return;
    return value;
  } catch {
    return;
  }
}

export function clearNativeWorkbenchHandoff(
  nonce: string | null,
  actor: WorkbenchActorScope,
  target: WorkbenchTarget,
  storage: HandoffStorage = sessionStorage,
) {
  if (readNativeWorkbenchHandoff(nonce, actor, target, storage))
    storage.removeItem(prefix + nonce);
}

/** Read only exact source messages; a shared conversation is never sufficient association. */
export async function loadWorkbenchChatContext(
  target: WorkbenchTarget,
  source: WorkbenchMessageSource | undefined,
  read: typeof researchApi,
  signal: AbortSignal,
): Promise<WorkbenchChatContext | undefined> {
  signal.throwIfAborted();
  const response =
    target.kind === "personal"
      ? await read("personalWorkTask", { params: { id: target.taskId }, signal })
      : await read("task", { params: { id: target.taskId }, signal });
  signal.throwIfAborted();
  const task = "task" in response.data ? response.data.task : response.data;
  if (task.id !== target.taskId || ("summaryOnly" in task && task.summaryOnly))
    throw Error("当前账号不能读取这项任务的工作背景。");
  const personal = "sourceConversationId" in task ? task : undefined;
  let sources: WorkbenchMessageSource[] = source ? [source] : [];
  let turn:
    | {
        id: string;
        conversationId: string;
        inputMessageId: string;
        outputMessageId: string | null;
      }
    | undefined;
  const readTurn = async () => {
    if (turn || !personal?.conversationId || !personal.turnId) return turn;
    const value = (await read("chatTurn", { params: { id: personal.turnId }, signal }))
      .data;
    signal.throwIfAborted();
    if (
      value.id !== personal.turnId ||
      value.conversationId !== personal.conversationId
    )
      throw Error("任务对应的聊天轮次不一致。");
    turn = value;
    return turn;
  };
  if (!source && personal?.sourceConversationId && personal.sourceMessageId)
    sources = [
      {
        conversationId: personal.sourceConversationId,
        messageId: personal.sourceMessageId,
      },
    ];
  else if (!source) {
    const value = await readTurn();
    if (value)
      sources = [value.inputMessageId, value.outputMessageId]
        .filter((id): id is string => !!id)
        .map((messageId) => ({ conversationId: value.conversationId, messageId }));
  }
  if (!sources.length) return;
  const messages = [];
  for (const item of sources) {
    const { data: details } = await read("chatMessageDetails", {
      params: { id: item.conversationId, messageId: item.messageId },
      signal,
    });
    signal.throwIfAborted();
    const message = details.message;
    if (
      message.id !== item.messageId ||
      message.conversationId !== item.conversationId ||
      details.withdrawn
    )
      throw Error("这条聊天记录已不可用，请重新核对来源。");
    let linked =
      message.resources.some(
        (ref) => ref.kind === "task" && ref.ref.id === target.taskId,
      ) ||
      (personal?.sourceConversationId === item.conversationId &&
        personal.sourceMessageId === item.messageId);
    if (!linked) {
      const value = await readTurn();
      linked =
        value?.conversationId === item.conversationId &&
        !!value &&
        [value.inputMessageId, value.outputMessageId].includes(item.messageId);
    }
    if (!linked) throw Error("这条消息没有明确关联这项任务，请从任务详情打开工作台。");
    if (message.text?.trim())
      messages.push({
        ...item,
        ...(message.turnId ? { turnId: message.turnId } : {}),
        text: message.text.slice(0, 32000),
      });
  }
  return messages.length ? { messages } : undefined;
}
