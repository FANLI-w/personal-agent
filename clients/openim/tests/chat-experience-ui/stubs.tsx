import React, { forwardRef, useImperativeHandle } from "react";
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
  createTextMessage: async (text: string) => ({
    clientMsgID: crypto.randomUUID(),
    sendID: "im_me",
    textElem: { content: text },
    contentType: 101,
  }),
  sendMessage: async (message: any) => ({ data: message.message }),
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
