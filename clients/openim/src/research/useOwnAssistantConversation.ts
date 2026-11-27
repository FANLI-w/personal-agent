import { SessionType } from "@openim/wasm-client-sdk";
import { useRef } from "react";
import { useNavigate } from "react-router-dom";

import { getCleanText } from "@/components/CKEditor/utils";
import { useConversationStore, useUserStore } from "@/store";
import { feedbackToast } from "@/utils/common";
import { researchApi } from "./api";
import { ensureResearchConversation } from "./bridge";
import { chatDrafts, saveChatDraft } from "./chat-outbox";
import { useResearchStore } from "./store";
import { usePersonalOperation } from "./usePersonalOperation";

const escapeText = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Open the pinned personal conversation for this login and stage editable text. */
export function useOwnAssistantConversation() {
  const navigate = useNavigate();
  const operation = usePersonalOperation(true, "own-assistant-conversation");
  const opening = useRef(false);

  return async (draft?: string): Promise<boolean> => {
    if (opening.current) return false;
    const { isCurrent } = operation.capture();
    const actorId = operation.actorId;
    const ownMapping = useResearchStore.getState().session?.coordinator;
    const activeMapping = useResearchStore
      .getState()
      .mappings.find(
        (mapping) =>
          !!ownMapping &&
          mapping.researchConversationId === ownMapping.researchConversationId &&
          mapping.imConversationID === ownMapping.imConversationID &&
          mapping.peerUserID === ownMapping.peerUserID,
      );
    const mapping = activeMapping ?? ownMapping;
    const currentSession = () => {
      const state = useResearchStore.getState();
      const user = useUserStore.getState();
      return (
        state.generation === operation.generation &&
        state.actor?.member.id === actorId &&
        state.sessionActorId === actorId &&
        state.session?.status === "available" &&
        state.session.user?.userID === user.selfInfo.userID &&
        !!user.selfInfo.userID &&
        state.session.coordinator?.researchConversationId ===
          mapping?.researchConversationId &&
        state.session.coordinator?.imConversationID === mapping?.imConversationID &&
        state.session.coordinator?.peerUserID === mapping?.peerUserID &&
        !user.isLogining &&
        user.connectState === "success" &&
        user.syncState === "success"
      );
    };
    const canCommit = () => isCurrent() && currentSession();

    opening.current = true;
    try {
      if (
        !actorId ||
        !canCommit() ||
        mapping?.kind !== "personal" ||
        !mapping.peerUserID
      )
        throw new Error("个人助理会话暂不可用，请等待聊天连接后重试。");

      const [authorized, conversation] = await Promise.all([
        researchApi("chatConversation", {
          params: { id: mapping.researchConversationId },
        }),
        ensureResearchConversation(mapping),
      ]);
      if (!canCommit()) return false;
      if (activeMapping?.transportStatus !== "ready") {
        await useResearchStore.getState().refresh();
        if (!canCommit()) return false;
      }
      if (
        authorized.data.id !== mapping.researchConversationId ||
        authorized.data.kind !== "personal" ||
        authorized.data.ownerMemberId !== actorId ||
        conversation.conversationID !== mapping.imConversationID ||
        conversation.userID !== mapping.peerUserID ||
        conversation.conversationType !== SessionType.Single
      )
        throw new Error("个人助理会话已变化，请重新打开。");

      const text = draft?.trim();
      const existingDraft = text
        ? chatDrafts.get(conversation.conversationID) || ""
        : "";
      if (text && getCleanText(existingDraft).length + text.length > 7998)
        throw new Error("个人助理聊天已有较长草稿，请先处理后再带入这段内容。");

      // Single-conversation selection commits synchronously. Route and draft
      // are updated together so the newly mounted composer sees the saved text.
      const store = useConversationStore.getState();
      const selection = store.updateCurrentConversation(
        { ...conversation },
        false,
        canCommit,
      );
      if (
        !currentSession() ||
        useConversationStore.getState().currentConversation?.conversationID !==
          conversation.conversationID
      ) {
        await selection;
        return false;
      }
      if (text) {
        const paragraph = `<p>${escapeText(text).replace(/\r\n?|\n/g, "<br>")}</p>`;
        saveChatDraft(conversation.conversationID, existingDraft + paragraph);
      }
      navigate(`/chat/${conversation.conversationID}`);
      await selection;
      return true;
    } catch (error) {
      if (isCurrent() || !actorId) feedbackToast({ error });
      return false;
    } finally {
      opening.current = false;
    }
  };
}
