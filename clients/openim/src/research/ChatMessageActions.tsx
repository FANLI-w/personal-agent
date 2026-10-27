import { useEffect, useRef, useState } from "react";
import { Alert, Button, Input, Modal, Radio } from "antd";
import { MessageStatus, MessageType, type MessageItem } from "@openim/wasm-client-sdk";
import { readChatMessage } from "./chat-message-read";
import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore, useUserStore } from "@/store";
import { useResearchStore } from "./store";
import { researchApi } from "./api";
import { useAgentChatOperation } from "./useAgentChatOperation";
import { withRequestDeadline } from "./request-deadline";
import {
  useChatTimeline,
  positionKey,
  saveChatPosition,
  researchPointer,
  type TimelineMessage,
} from "./chat-timeline";

export function ChatMessageActions() {
  const state = useChatTimeline();
  const conversation = useConversationStore((s) => s.currentConversation);
  const conversations = useConversationStore((s) => s.conversationList);
  const actor = useResearchStore((s) => s.actor?.member.id || "");
  const self = useUserStore((s) => s.selfInfo.userID);
  const capture = useAgentChatOperation();
  const [target, setTarget] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string[]>([]);
  const pending = useRef(new Map<string, MessageItem>());
  const operationKey = useRef(crypto.randomUUID());
  const lock = useRef(false);
  const scope = useRef(state.scope);
  scope.current = state.scope;
  const entries = (state.action?.ids || [])
    .map((id) => state.entries[id])
    .filter((e): e is TimelineMessage => !!e);
  useEffect(() => {
    setTarget("");
    setQuery("");
    setError("");
    setDone([]);
    setBusy(false);
    lock.current = false;
    pending.current.clear();
    operationKey.current = crypto.randomUUID();
  }, [state.scope, state.action]);
  const close = () => {
    if (!lock.current) useChatTimeline.setState({ action: undefined });
  };
  const run = async () => {
    if (lock.current || !state.action || !conversation || !entries.length) return;
    const destination = conversations.find((c) => c.conversationID === target);
    if (state.action.kind === "forward" && !destination) return;
    const operation = capture(),
      capturedScope = state.scope;
    const current = () => operation.isCurrent() && scope.current === capturedScope;
    lock.current = true;
    setBusy(true);
    setError("");
    let completed = [...done];
    try {
      for (const entry of entries) {
        if (!current()) throw new Error("会话或账号已切换，剩余操作已停止。");
        const id = entry.message.clientMsgID;
        if (completed.includes(id)) continue;
        if (state.action.kind === "forward") {
          if (entry.message.status !== MessageStatus.Succeed)
            throw new Error("这条消息尚未确认发送成功，请先处理原消息。");
          // Re-read canonical text under live ACL; never transplant a privileged custom pointer.
          let message = pending.current.get(id);
          let acknowledged = false;
          if (message) {
            const existing = await withRequestDeadline(
              () =>
                IMSDK.findMessageList([
                  {
                    conversationID: destination!.conversationID,
                    clientMsgIDList: [message!.clientMsgID],
                  },
                ]),
              30000,
              operation.signal,
            );
            acknowledged = !!existing.data.searchResultItems?.some((item) =>
              item.messageList.some(
                (m) =>
                  m.clientMsgID === message!.clientMsgID &&
                  m.status === MessageStatus.Succeed,
              ),
            );
          }
          const pointer = researchPointer(entry.message);
          const source =
            pointer && !acknowledged
              ? await readChatMessage(
                  pointer.conversationId,
                  pointer.messageId,
                  pointer.sequence,
                  operation.signal,
                )
              : undefined;
          if (source?.details?.withdrawn)
            throw new Error("源消息已撤回，不能继续转发。");
          if (!message) {
            if (pointer) {
              if (!source?.fact.text)
                throw new Error("此消息没有可转发正文，请单独选择可读取的附件。");
              if (!current()) return;
              message = (
                await IMSDK.createTextMessage(
                  `转发自 ${entry.message.senderNickname || "成员"}：\n${
                    source.fact.text
                  }`,
                )
              ).data;
            } else {
              if (entry.message.contentType === MessageType.CustomMessage)
                throw new Error("此类协作卡片暂不支持转发，请复制可分享的文字。");
              message = (await IMSDK.createForwardMessage(entry.message)).data;
            }
            pending.current.set(id, message);
          }
          if (!current() || message.sendID !== self)
            throw new Error("发送身份已变化，请重新选择。");
          if (!acknowledged)
            await withRequestDeadline(
              () =>
                IMSDK.sendMessage({
                  recvID: destination!.userID || "",
                  groupID: destination!.groupID || "",
                  message: message!,
                }),
              30000,
              operation.signal,
            );
        } else if (state.action.kind === "withdraw") {
          const pointer = researchPointer(entry.message);
          if (pointer) {
            const detail = await researchApi("chatMessageDetails", {
              params: { id: pointer.conversationId, messageId: pointer.messageId },
              signal: operation.signal,
            });
            if (!detail.data.withdrawn) {
              if (!detail.data.allowedActions.includes("withdraw"))
                throw new Error("当前已不能撤回这条消息，请重新核对。");
              await researchApi("withdrawChatMessage", {
                params: { id: pointer.conversationId, messageId: pointer.messageId },
                body: { expectedVersion: detail.data.version },
                idempotencyKey: operationKey.current,
                signal: operation.signal,
              });
            }
          } else
            await withRequestDeadline(
              () =>
                IMSDK.revokeMessage({
                  conversationID: conversation.conversationID,
                  clientMsgID: id,
                }),
              30000,
              operation.signal,
            );
        } else {
          if (entry.message.status !== MessageStatus.Succeed)
            throw new Error("这条消息的发送结果尚未确认，请先在输入区处理原消息。");
          await withRequestDeadline(
            () =>
              IMSDK.deleteMessageFromLocalStorage({
                conversationID: conversation.conversationID,
                clientMsgID: id,
              }),
            30000,
            operation.signal,
          );
          if (current()) {
            const hidden = [
              ...new Set([...useChatTimeline.getState().hidden, id]),
            ].slice(-2000);
            saveChatPosition(positionKey(actor || self, conversation.conversationID), {
              hidden,
            });
            useChatTimeline.setState({ hidden });
          }
        }
        completed.push(id);
        if (current()) setDone([...completed]);
      }
      if (current())
        useChatTimeline.setState({ action: undefined, selected: [], selecting: false });
    } catch (cause) {
      if (current())
        setError(
          `${cause instanceof Error ? cause.message : "操作未完成"} 已确认 ${
            completed.length
          }/${entries.length} 条；再次操作会跳过已确认的消息。`,
        );
    } finally {
      if (current()) {
        lock.current = false;
        setBusy(false);
      }
      operation.dispose();
    }
  };
  const available = conversations.filter(
    (c) =>
      (c.userID || c.groupID) &&
      c.showName.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <>
      {state.selecting && (
        <div className="chat-selection-bar" role="toolbar" aria-label="批量消息操作">
          <span>已选 {state.selected.length} 条</span>
          <Button
            size="small"
            disabled={!state.selected.length}
            onClick={() =>
              useChatTimeline.setState({
                action: { kind: "forward", ids: [...state.selected] },
              })
            }
          >
            转发
          </Button>
          <Button
            size="small"
            disabled={!state.selected.length}
            onClick={() =>
              useChatTimeline.setState({
                action: { kind: "delete", ids: [...state.selected] },
              })
            }
          >
            本机删除
          </Button>
          <Button
            size="small"
            onClick={() => useChatTimeline.setState({ selecting: false, selected: [] })}
          >
            取消多选
          </Button>
        </div>
      )}
      <Modal
        title={
          state.action?.kind === "forward"
            ? "转发消息"
            : state.action?.kind === "withdraw"
            ? "撤回消息？"
            : "从本机删除消息？"
        }
        open={!!state.action}
        onCancel={close}
        maskClosable={!busy}
        closable={!busy}
        okText={error ? "继续处理未确认消息" : "确认"}
        cancelText="取消"
        onOk={() => void run()}
        confirmLoading={busy}
        okButtonProps={{
          disabled: !entries.length || (state.action?.kind === "forward" && !target),
        }}
        cancelButtonProps={{ disabled: busy }}
      >
        <p>
          {state.action?.kind === "forward"
            ? "Agent 回答按署名文字转发；任务操作与原会话资料权限不随之转移。"
            : state.action?.kind === "withdraw"
            ? "撤回自己的消息并停止依赖它的在途助手请求。已经生成的回答、转发副本和已执行任务会保留。"
            : "只影响此账号的本机消息列表，不撤回他人收到的内容，也不取消助手任务。"}
        </p>
        {state.action?.kind === "forward" && (
          <>
            <Input
              aria-label="搜索转发目标"
              placeholder="搜索已有会话"
              value={query}
              disabled={busy || done.length > 0 || pending.current.size > 0}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Radio.Group
              className="chat-forward-targets"
              value={target}
              disabled={busy || done.length > 0 || pending.current.size > 0}
              onChange={(e) => setTarget(e.target.value)}
            >
              {available.map((c) => (
                <Radio key={c.conversationID} value={c.conversationID}>
                  {c.showName}
                  {c.groupID ? " · 群聊" : ""}
                </Radio>
              ))}
            </Radio.Group>
          </>
        )}
        <div className="chat-action-preview">
          {entries.map((e) => (
            <p key={e.message.clientMsgID}>
              <strong>{e.message.senderNickname || "成员"}</strong>{" "}
              {e.text.slice(0, 160) || "[附件]"}
              {done.includes(e.message.clientMsgID) ? " ✓" : ""}
            </p>
          ))}
        </div>
        {error && <Alert type="warning" message={error} />}
      </Modal>
    </>
  );
}
