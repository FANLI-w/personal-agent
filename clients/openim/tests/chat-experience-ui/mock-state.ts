import { create } from "zustand";
export const roster = [
  {
    id: "human_me",
    displayName: "测试老师",
    identity: { kind: "human", memberId: "me" },
  },
  {
    id: "human_peer",
    displayName: "测试同事",
    identity: { kind: "human", memberId: "peer" },
  },
  {
    id: "agent_mine",
    displayName: "文献助手",
    identity: { kind: "personal_agent", ownerMemberId: "me" },
  },
  {
    id: "agent_peer",
    displayName: "文献助手",
    identity: { kind: "personal_agent", ownerMemberId: "peer" },
  },
  {
    id: "agent_method",
    displayName: "方法助手",
    identity: { kind: "personal_agent", ownerMemberId: "peer" },
  },
].map((c) => ({
  ...c,
  availability: { status: "available", reason: null },
  allowedActions: ["chat"],
  profile: { role: c.identity.kind === "human" ? "human" : "specialist", version: 1 },
  relationship: { status: "accepted" },
  version: 1,
}));
export const useConversationStore = create(() => ({
  updateConversationList: (items: any[]) =>
    useConversationStore.setState((s) => ({
      currentConversation:
        items.find((c) => c.conversationID === s.currentConversation.conversationID) ||
        s.currentConversation,
    })),
  conversationList: [
    {
      conversationID: "fixture_group",
      groupID: "test_group",
      userID: "",
      showName: "课题讨论",
      conversationType: 3,
    },
    {
      conversationID: "fixture_peer",
      groupID: "",
      userID: "im_peer",
      showName: "测试同事",
      conversationType: 1,
    },
    {
      conversationID: "fixture_agent", groupID: "", userID: "im_agent_mine",
      showName: "测试老师的助手", conversationType: 1,
    },
  ],
  currentConversation: {
    conversationID: "fixture_group",
    groupID: "test_group",
    userID: "",
    showName: "课题讨论 · 合成测试",
    conversationType: 3,
  },
  currentGroupInfo: { memberCount: 5 },
  currentMemberInGroup: { userID: "im_me", groupID: "test_group" },
}));
export const useUserStore = create(() => ({
  isLogining: false,
  connectState: "success",
  syncState: "success",
  selfInfo: { userID: "im_me", nickname: "测试老师" },
  appSettings: { locale: "zh-CN" },
}));
export const useResearchStore = create(() => ({
  generation: 1,
  actor: { member: { id: "me" }, isLabManager: false },
  sessionActorId: "me",
  contacts: roster.map((c) => ({ userID: "im_" + c.id, contact: c })),
  mappings: [
    {
      imConversationID: "fixture_group",
      researchConversationId: "group",
      kind: "group",
    },
  ],
  refresh: async () => {},
}));
