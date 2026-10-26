import type { researchApi } from "./api";
import type { Contact, RequestFor } from "@research-agent-platform/contracts";
import { agentRoles, legacyRoleProfiles as legacyProfiles } from "@research-agent-platform/research-skills/role-catalog";
import type { AgentRoleDefinition } from "@research-agent-platform/research-skills/roles";

export type AgentStarter = {
  id: string; summary: string; input: string; boundary: string;
  category: AgentRoleDefinition["category"]; teams: AgentRoleDefinition["teams"]; methods: readonly string[];
  profile: RequestFor<"createPersonalAgent">["body"];
};
// Defaults come exclusively from canonical role Markdown. Historical profiles
// are exact-match reuse data and are never applied over user edits.
export const agentStarters: readonly AgentStarter[] = agentRoles.filter(role => role.kind === "specialist" && role.id !== "general-specialist");
export const libraryAgentStarter = agentStarters.find(role => role.id === "research-library")!;
export const planningAgentStarter = agentStarters.find(role => role.id === "research-planning")!;

export function findOwnedStarter(
  contacts: readonly Contact[],
  starter: AgentStarter,
  actorId: string,
  rememberedContactId?: string,
) {
  const remembered = contacts.find(
    (contact) =>
      contact.id === rememberedContactId &&
      contact.identity.kind === "personal_agent" &&
      contact.identity.ownerMemberId === actorId &&
      contact.profile.role === "specialist" &&
      contact.relationship.status === "own",
  );
  if (remembered) return remembered;
  return contacts.find(
    (contact) =>
      contact.identity.kind === "personal_agent" &&
      contact.identity.ownerMemberId === actorId &&
      contact.profile.role === "specialist" &&
      contact.relationship.status === "own" &&
      [
        starter.profile,
        ...legacyProfiles.filter(item => item.id === starter.id).map(item => item.profile),
      ].some(
        (profile) =>
          profile &&
          contact.displayName === profile.displayName &&
          contact.profile.introduction === profile.introduction &&
          contact.profile.capabilityDescription === profile.capabilityDescription &&
          contact.profile.personality === profile.personality,
      ),
  );
}

export async function prepareColleagueAgent(options: {
  api: typeof researchApi;
  actorId: string;
  starter: AgentStarter;
  rememberedId?: string;
  creationKey: string;
  isCurrent: () => boolean;
  create?: boolean;
}) {
  const { api, actorId, starter, isCurrent } = options;
  if (!isCurrent()) return;
  const owned = await api("chatContacts", { query: { view: "mine", scope: "local", limit: 100 } });
  if (!isCurrent()) return;
  let agent = findOwnedStarter(owned.data, starter, actorId, options.rememberedId);
  if (options.rememberedId && agent?.id !== options.rememberedId)
    throw new Error("这位助手的身份已变化，请在通讯录的智能体资料中核对，原对话仍保留。");
  if (!agent && options.create === false) return;
  if (!agent) agent = (await api("createPersonalAgent", { body: starter.profile, idempotencyKey: options.creationKey })).data;
  if (!isCurrent()) return;
  if (agent.identity.kind !== "personal_agent" || agent.identity.ownerMemberId !== actorId || agent.agentRuntime || agent.profile.role !== "specialist")
    throw new Error("请使用你自己的站内助手，原对话与设置仍保留。");
  const conversation = (await api("createDirectConversation", { body: { contactId: agent.id } })).data;
  if (!isCurrent()) return;
  const agentId = agent.id;
  if (conversation.kind !== "direct" || conversation.ownerMemberId !== actorId || !conversation.members.some(m => m.contactId === agentId && m.status === "joined"))
    throw new Error("助手与对话不一致，请重新读取。");
  return { agent, conversationId: conversation.id };
}
export type ColleagueAgent = { agent: Contact; conversationId: string };
