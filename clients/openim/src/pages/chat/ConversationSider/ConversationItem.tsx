import type {
  ConversationItem as ConversationItemType,
  MessageItem,
} from "@openim/wasm-client-sdk/lib/types/entity";
import { Badge, Dropdown, Modal } from "antd";
import { PushpinOutlined, BellOutlined } from "@ant-design/icons";
import clsx from "clsx";
import { t } from "i18next";
import { memo, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";

import OIMAvatar from "@/research/ResearchAvatar";
import { useConversationStore } from "@/store";
import { MessageReceiveOption } from "@openim/wasm-client-sdk";
import {
  changeConversationPreference,
  deleteIMConversation,
  type ConversationActionScope,
} from "@/research/conversation-actions";
import {
  useAgentChatOperation,
  type AgentChatOperation,
} from "@/research/useAgentChatOperation";
import { formatConversionTime, getConversationContent } from "@/utils/imCommon";
import { feedbackToast } from "@/utils/common";

import styles from "./conversation-item.module.scss";
import { useResearchStore } from "@/research/store";

interface IConversationProps {
  isActive: boolean;
  conversation: ConversationItemType;
}

const ConversationItem = ({ isActive, conversation }: IConversationProps) => {
  const navigate = useNavigate();
  const coordinator = useResearchStore((s) => s.session?.coordinator);
  const contact = useResearchStore(
    (s) => s.contacts.find((c) => c.userID === conversation.userID)?.contact,
  );
  const isCoordinator = coordinator?.imConversationID === conversation.conversationID;
  const isMuted =
    conversation.recvMsgOpt === MessageReceiveOption.ReceiveWithoutNotification;
  const actorGeneration = useResearchStore((s) => s.generation);
  const captureOperation = useAgentChatOperation();
  const busy = useRef(false);
  const updateCurrentConversation = useConversationStore(
    (state) => state.updateCurrentConversation,
  );
  const toSpecifiedConversation = async () => {
    if (isActive) {
      return;
    }
    await updateCurrentConversation({ ...conversation });
    navigate(`/chat/${conversation.conversationID}`);
  };

  const latestMessageContent = useMemo(() => {
    let content = "";
    if (!conversation.latestMsg) {
      return "";
    }
    try {
      content = getConversationContent(
        JSON.parse(conversation.latestMsg) as MessageItem,
      );
    } catch (error) {
      content = t("messageDescription.catchMessage");
    }
    return content;
  }, [conversation.latestMsg]);

  const latestMessageTime = formatConversionTime(conversation.latestMsgSendTime, Boolean(window.electronAPI));

  const mapping = useResearchStore((s) =>
    s.mappings.find((c) => c.imConversationID === conversation.conversationID),
  );

  const contextMenuItems = [
    {
      key: "pin",
      label: isCoordinator
        ? "个人助理固定置顶"
        : conversation.isPinned
        ? "取消置顶"
        : "置顶聊天",
      disabled: isCoordinator,
    },
    { key: "mute", label: isMuted ? "取消免打扰" : "开启免打扰" },
    { key: "delete", label: "删除聊天", danger: true, disabled: isCoordinator },
  ];

  const perform = async (
    operation: AgentChatOperation,
    action: (scope: ConversationActionScope) => Promise<void>,
  ) => {
    if (busy.current) {
      operation.dispose();
      const error = new Error("正在处理此聊天，请稍后重试。");
      feedbackToast({ error, msg: error.message });
      throw error;
    }
    busy.current = true;
    try {
      await action({
        conversation,
        researchConversationId: mapping?.researchConversationId,
        isCoordinator,
        signal: operation.signal,
        isCurrent: () =>
          actorGeneration === useResearchStore.getState().generation &&
          operation.isCurrent(),
      });
    } catch (cause) {
      if (
        actorGeneration === useResearchStore.getState().generation &&
        operation.isCurrent()
      )
        feedbackToast({ error: cause, msg: "操作未确认，请重试核对。" });
      throw cause;
    } finally {
      busy.current = false;
      operation.dispose();
    }
  };

  const deleteConversation = () => {
    if (isCoordinator) {
      feedbackToast({ msg: "个人助理会话无法删除" });
      return;
    }
    const operation = captureOperation();
    Modal.confirm({
      title: "删除聊天",
      content:
        "将删除 OpenIM 中此聊天及其消息记录，无法撤销。对方和后台科研会话记录不会被删除；后续新消息可能使聊天重新出现。",
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onCancel: operation.dispose,
      afterClose: operation.dispose,
      onOk: async () => {
        if (
          actorGeneration !== useResearchStore.getState().generation ||
          !operation.isCurrent()
        ) {
          const error = new Error("账号或会话已切换，请取消后重新操作。");
          feedbackToast({ error, msg: error.message });
          throw error;
        }
        await perform(operation, async (scope) => {
          await deleteIMConversation(scope);
          const state = useConversationStore.getState();
          if (
            scope.isCurrent() &&
            state.currentConversation?.conversationID === conversation.conversationID
          ) {
            void state.updateCurrentConversation(undefined, false, scope.isCurrent);
            navigate("/chat", { replace: true });
          }
        });
      },
    });
  };

  const onContextMenuClick = ({ key }: { key: string }) => {
    if (key === "pin" || key === "mute")
      void perform(captureOperation(), (scope) =>
        changeConversationPreference(
          scope,
          key,
          key === "pin" ? !conversation.isPinned : !isMuted,
        ),
      ).catch(() => {});
    else if (key === "delete") deleteConversation();
  };

  return (
    <Dropdown
      trigger={["contextMenu"]}
      menu={{ items: contextMenuItems, onClick: onContextMenuClick }}
    >
      <button
        type="button"
        aria-current={isActive ? "true" : undefined}
        className={clsx(
          styles["conversation-item"],
          "desktop-conversation-row w-full border border-transparent text-left",
          isActive && `bg-[var(--primary-active)]`,
        )}
        onClick={() => void toSpecifiedConversation()}
      >
        <Badge
          size="small"
          count={conversation.unreadCount}
          color={isMuted ? "rgba(0,0,0,0.25)" : undefined}
        >
          <OIMAvatar
            userID={conversation.userID}
            src={conversation.faceURL}
            isgroup={Boolean(conversation.groupID)}
            text={conversation.showName}
            size={window.electronAPI ? 40 : 42}
          />
        </Badge>

        <div className="ml-3 flex h-11 flex-1 flex-col justify-between overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex-1 truncate font-medium">
              {contact?.displayName || conversation.showName}
              {!window.electronAPI && (contact && contact.identity.kind !== "human" ? (
                <span className="desktop-agent-label ml-1 text-xs text-blue-600">
                  Agent
                </span>
              ) : conversation.groupID ? (
                <span className="desktop-agent-label ml-1 text-xs text-slate-500">
                  群
                </span>
              ) : null)}
            </div>
            <div className="desktop-conversation-time ml-2 shrink-0 text-xs text-[var(--sub-text)]">
              {latestMessageTime}
            </div>
          </div>

          <div className="flex items-center">
            <div className="flex min-h-[16px] flex-1 items-center overflow-hidden text-xs">
              <div className="truncate text-[rgba(81,94,112,0.5)]">
                {latestMessageContent}
              </div>
            </div>
            {(isCoordinator || conversation.isPinned) && (
              <PushpinOutlined
                className="desktop-conversation-pin"
                aria-label={isCoordinator ? "个人助理置顶" : "聊天置顶"}
              />
            )}
            {isMuted && (
              <BellOutlined className="desktop-conversation-pin" aria-label="免打扰" />
            )}
          </div>
        </div>
      </button>
    </Dropdown>
  );
};

export default memo(ConversationItem);
