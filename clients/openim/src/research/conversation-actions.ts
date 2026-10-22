import { MessageReceiveOption } from "@openim/wasm-client-sdk";
import type { ConversationItem } from "@openim/wasm-client-sdk/lib/types/entity";
import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore } from "@/store";
import { researchApi } from "./api";
import { withRequestDeadline } from "./request-deadline";

export type ConversationActionScope = {
  conversation: ConversationItem;
  researchConversationId?: string;
  isCoordinator: boolean;
  signal: AbortSignal;
  isCurrent: () => boolean;
};

function assertCurrent(scope: ConversationActionScope) {
  if (scope.signal.aborted || !scope.isCurrent())
    throw new DOMException("账号或会话已切换，请重新操作。", "AbortError");
}

async function sdkCall<T>(scope: ConversationActionScope, run: () => Promise<T>) {
  assertCurrent(scope);
  const result = await withRequestDeadline(
    () => {
      assertCurrent(scope);
      return run();
    },
    30000,
    scope.signal,
  );
  assertCurrent(scope);
  return result;
}

export async function changeConversationPreference(
  scope: ConversationActionScope,
  kind: "pin" | "mute",
  enabled: boolean,
) {
  assertCurrent(scope);
  if (kind === "pin" && scope.isCoordinator) throw new Error("个人助理保持固定置顶。");
  const { conversation } = scope;
  const read = () =>
    IMSDK.getOneConversation({
      sourceID: conversation.groupID || conversation.userID,
      sessionType: conversation.conversationType,
    });
  // Keep the menu's explicit intent. Retrying an uncertain write must not
  // invert an already committed setting just because its refresh was late.
  if (kind === "pin" && scope.researchConversationId) {
    const canonical = await researchApi("chatConversation", {
      params: { id: scope.researchConversationId },
      signal: scope.signal,
    });
    assertCurrent(scope);
    await researchApi("updateChatPreferences", {
      params: { id: scope.researchConversationId },
      body: { expectedVersion: canonical.data.viewerState.version, pinned: enabled },
      signal: scope.signal,
    });
    assertCurrent(scope);
  }
  await sdkCall(scope, () =>
    IMSDK.setConversation({
      conversationID: conversation.conversationID,
      ...(kind === "pin"
        ? { isPinned: enabled }
        : {
            recvMsgOpt: enabled
              ? MessageReceiveOption.ReceiveWithoutNotification
              : MessageReceiveOption.Receive,
          }),
    }),
  );
  const { data } = await sdkCall(scope, read);
  useConversationStore.getState().updateConversationList([data], "filter");
}

export async function deleteIMConversation(scope: ConversationActionScope) {
  assertCurrent(scope);
  if (scope.isCoordinator) throw new Error("个人助理会话无法删除。");
  await sdkCall(scope, () =>
    IMSDK.deleteConversationAndDeleteAllMsg(scope.conversation.conversationID),
  );
  useConversationStore.setState((state) => ({
    conversationList: state.conversationList.filter(
      (item) => item.conversationID !== scope.conversation.conversationID,
    ),
  }));
}
