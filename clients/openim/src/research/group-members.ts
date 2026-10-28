import type {
  Contact,
  Conversation,
  ResponseFor,
} from "@research-agent-platform/contracts";

type ContactPage = ResponseFor<"chatContacts">;
/** Read both directory scopes; SDK friend caches are not an identity authority. */
export async function readGroupCandidates(
  read: (view: "mine" | "directory", cursor?: string) => Promise<ContactPage>,
  signal: AbortSignal,
) {
  const scopes = await Promise.all(
    (["mine", "directory"] as const).map(async (view) => {
      const contacts = new Map<string, Contact>();
      const seen = new Set<string>();
      let cursor: string | undefined;
      do {
        signal.throwIfAborted();
        const page = await read(view, cursor);
        signal.throwIfAborted();
        for (const contact of page.data) contacts.set(contact.id, contact);
        cursor = page.nextCursor || undefined;
        if (cursor && (seen.has(cursor) || contacts.size >= 2000))
          throw new Error("联系人名单未能完整读取，请刷新重试。");
        if (cursor) seen.add(cursor);
      } while (cursor);
      return [...contacts.values()];
    }),
  );
  return [...new Map([...scopes[1], ...scopes[0]].map((c) => [c.id, c])).values()];
}

export function selectableGroupContacts(contacts: Contact[], actorId?: string) {
  return contacts.filter(
    (c) =>
      c.allowedActions.includes("chat") &&
      !(c.identity.kind === "human" && c.identity.memberId === actorId),
  );
}

export function groupIdentityLabel(
  contact: Contact,
  contacts: Contact[],
  actorId?: string,
) {
  if (contact.identity.kind === "human")
    return contact.username ? `联系人 · ${contact.username}` : "联系人";
  const ownerId = contact.identity.ownerMemberId;
  if (ownerId === actorId) return "我的智能体";
  const owner = contacts.find(
    (c) => c.identity.kind === "human" && c.identity.memberId === ownerId,
  );
  return owner ? `${owner.displayName}的智能体` : "其他成员的智能体";
}

export function canonicalGroupMembers(conversation: Conversation, contacts: Contact[]) {
  const byId = new Map(contacts.map((c) => [c.id, c]));
  return conversation.members
    .filter((m) => m.status === "joined" || m.status === "invited")
    .map((member) => {
      const contact = byId.get(member.contactId);
      return {
        ...member,
        contact,
        // Never use an SDK role, list position or nickname to identify the owner.
        isOwner:
          member.status === "joined" &&
          member.role === "owner" &&
          contact?.identity.kind === "human" &&
          contact.identity.memberId === conversation.ownerMemberId,
      };
    });
}
