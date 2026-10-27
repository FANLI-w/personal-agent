import React, { forwardRef, useImperativeHandle } from "react";
import { nativeMessages, sdkCalls, sdkBehavior } from "./timeline-data";
import { roster, useConversationStore } from "./mock-state";
export const useSkillChatSelection = () => ({ controls: null, invalid: false });
export const useResearchContactChat = () => async () => {};
export const useAgentFileReading = () => ({
  controls: null,
  busy: false,
  onFileSent: async () => {},
});
export const useAgentImageReading = () => ({
  controls: null,
  busy: false,
  onImageSent: async () => {},
});
export const directImageAgent = () => undefined;
export const canReadSdkImage = () => false;
export const canReadSdkFile = () => false;
export const useFileMessage = () => ({
  getImageMessage: async () => {},
  getFileMessage: async () => {},
  getSoundMessage: async () => {},
});
export const useScopedFileSender = () => async () => false;
export const IMSDK = {
  getGroupMemberList: async () => ({
    data: roster.map((c) => ({
      userID: "im_" + c.id,
      nickname: c.displayName,
      groupID: "test_group",
    })),
  }),
  setConversation: async (options: any) => {
    sdkCalls.push({ name: "preference", ...options });
    useConversationStore.setState((s) => ({
      currentConversation: { ...s.currentConversation, ...options },
    }));
    return { data: {} };
  },
  getOneConversation: async () => ({
    data: useConversationStore.getState().currentConversation,
  }),
  findMessageList: async (options: any) => ({
    data: {
      searchResultItems: [
        {
          messageList: sdkCalls
            .filter(
              (c) =>
                c.name === "send" &&
                options[0].clientMsgIDList.includes(c.message.clientMsgID),
            )
            .map((c) => ({ ...c.message, status: 2 })),
        },
      ],
    },
  }),
  createTextMessage: async (text: string) => ({
    data: {
      clientMsgID: crypto.randomUUID(),
      sendID: "im_me",
      textElem: { content: text },
      contentType: 101,
    },
  }),
  createForwardMessage: async (message: any) => ({
    data: { ...message, clientMsgID: crypto.randomUUID(), sendID: "im_me" },
  }),
  sendMessage: async (message: any) => {
    sdkCalls.push({ name: "send", ...message });
    if (sdkBehavior.loseAck) {
      sdkBehavior.loseAck = false;
      throw new Error("合成测试：服务端已接收，回执丢失");
    }
    return { data: message.message };
  },
  getAdvancedHistoryMessageList: async (options: any) => {
    sdkCalls.push({ name: "history", ...options });
    const all = options.conversationID === "fixture_group" ? nativeMessages : [];
    const end = options.startClientMsgID
      ? all.findIndex((m) => m.clientMsgID === options.startClientMsgID)
      : all.length;
    const start = Math.max(0, end - options.count);
    return { data: { messageList: all.slice(start, end), isEnd: start === 0 } };
  },
  searchLocalMessages: async (options: any) => ({
    data: {
      totalCount: 1,
      searchResultItems: [
        {
          messageList: nativeMessages.filter((m) =>
            m.textElem?.content.includes(options.keywordList[0]),
          ),
        },
      ],
    },
  }),
  deleteMessageFromLocalStorage: async (options: any) => {
    sdkCalls.push({ name: "delete", ...options });
    return { data: {} };
  },
  revokeMessage: async (options: any) => {
    sdkCalls.push({ name: "revoke", ...options });
    return { data: {} };
  },
};
export const useSendMessage = () => ({ sendMessage: async () => {} });
export const PersonalReceiptCard = () => null;
export const CreatedAgentChatButton = () => null;
export const AgentFileReadSummary = () => null;
export const agentFileReadCoverage = () => undefined;
export const Empty = ({ collaboration }: any) => collaboration || null;
export const ImageTray = forwardRef((props: any, ref) => {
  useImperativeHandle(ref, () => ({
    snapshot: () => [],
    commit: () => {},
    stage: () => {},
    readClipboard: () => {},
  }));
  return null;
});
export default Empty;
