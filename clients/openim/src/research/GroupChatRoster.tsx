import { createContext, useContext, type ReactNode } from "react";
import type {
  Contact,
  Conversation,
  ResponseFor,
} from "@research-agent-platform/contracts";
import { useResearchRead } from "./useResearchRead";
import { researchApi } from "./api";
import { useResearchStore } from "./store";

type RosterRead = {
  data?: ResponseFor<"chatConversationContacts">;
  error: string;
  loading: boolean;
  conversation?: Conversation;
  memberContacts?: Contact[];
  refresh?: () => Promise<void>;
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
    async (signal) => {
      const conversation = (
        await researchApi("chatConversation", {
          params: { id: mapping?.researchConversationId || "" },
          signal,
        })
      ).data;
      let cursor: string | undefined;
      let result: ResponseFor<"chatConversationContacts"> | undefined;
      const contacts = new Map<string, Contact>();
      do {
        const page = await researchApi("chatConversationContacts", {
          params: { id: mapping?.researchConversationId || "" },
          query: { limit: 100, cursor },
          signal,
        });
        result = page;
        for (const contact of page.data) contacts.set(contact.id, contact);
        if (page.nextCursor === cursor && cursor)
          throw new Error("群成员名单分页未前进，请重新读取。");
        cursor = page.nextCursor || undefined;
      } while (cursor && contacts.size < 2000);
      if (cursor)
        throw new Error("群成员超过本次可读取范围，请缩小群规模后再提及助手。");
      const joinedContacts = [...contacts.values()];
      // Invitations are not joined roster entries. Read only profiles this actor
      // is allowed to see, and never make them mentionable before acceptance.
      const pendingContacts = await Promise.all(
        conversation.members
          .filter((m) => m.status === "invited")
          .map(async (m) => {
            try {
              return (
                await researchApi("chatContact", {
                  params: { id: m.contactId },
                  signal,
                })
              ).data;
            } catch (error) {
              if (signal.aborted) throw error;
              return undefined;
            }
          }),
      );
      return {
        ...result!,
        data: joinedContacts,
        conversation,
        memberContacts: [
          ...joinedContacts,
          ...pendingContacts.filter((c): c is Contact => !!c),
        ],
      };
    },
    `${imID}:group-roster:${mapping?.researchConversationId}`,
    mapping?.kind === "group",
  );
  return (
    <RosterContext.Provider
      value={{
        ...read,
        conversation: read.data?.conversation,
        memberContacts: read.data?.memberContacts,
      }}
    >
      {children}
    </RosterContext.Provider>
  );
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
