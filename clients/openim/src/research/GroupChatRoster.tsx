import { createContext, useContext, type ReactNode } from "react";
import type { Contact, ResponseFor } from "@research-agent-platform/contracts";
import { useResearchRead } from "./useResearchRead";
import { researchApi } from "./api";
import { useResearchStore } from "./store";

type RosterRead = {
  data?: ResponseFor<"chatConversationContacts">;
  error: string;
  loading: boolean;
};
const RosterContext = createContext<RosterRead>({ error: "", loading: false });
export const useGroupChatRoster = () => useContext(RosterContext);

/** One authorized roster per open conversation, shared by the editor and timeline. */
export function GroupChatRoster({
  imID,
  children,
}: {
  imID?: string;
  children: ReactNode;
}) {
  const mapping = useResearchStore((s) =>
    s.mappings.find((m) => m.imConversationID === imID),
  );
  const read = useResearchRead(
    (signal) =>
      researchApi("chatConversationContacts", {
        params: { id: mapping?.researchConversationId || "" },
        query: { limit: 100 },
        signal,
      }),
    `${imID}:group-roster:${mapping?.researchConversationId}`,
    mapping?.kind === "group",
  );
  return <RosterContext.Provider value={read}>{children}</RosterContext.Provider>;
}

export function groupContactDescription(
  contact: Contact,
  roster: Contact[],
  actorId?: string,
) {
  if (contact.identity.kind === "human") return "群成员";
  const ownerId = contact.identity.ownerMemberId;
  if (ownerId === actorId) return "我的助手";
  const owner = roster.find(
    (c) => c.identity.kind === "human" && c.identity.memberId === ownerId,
  );
  return owner ? `${owner.displayName}的助手` : "群内助手";
}
