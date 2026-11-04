import type { ChatService } from './chat.js'

/** Follow live contact grants only through explicitly joined human members.
 * An invited colleague may bring their own contacts/Agents; they need not also
 * belong to the owner's address book. An Agent never sponsors its human owner.
 * No task, material, lab or private-memory authority is derived here.
 */
export function socialGroupContacts(s: ChatService, conversationId: string) {
  const owner = s.db.prepare('SELECT owner_id FROM chat_conversations WHERE id=?').get(conversationId)
  const members = s.db.prepare(`SELECT c.id,c.owner_id,c.kind FROM chat_members m
    JOIN chat_contacts c ON c.id=m.contact_id
    JOIN auth_accounts a ON a.member_id=c.owner_id AND a.disabled=0
    WHERE m.conversation_id=? AND m.status='joined' AND c.kind!='public_agent'
    AND NOT EXISTS(SELECT 1 FROM deleted_personal_agents d WHERE d.contact_id=c.id)`).all(conversationId)
  const humans = new Map(members.filter(m => m.kind === 'human').map(m => [String(m.owner_id), String(m.id)]))
  const allowed = new Set<string>()
  if (!owner || !humans.has(String(owner.owner_id))) return allowed
  const byId = new Map(members.map(m => [String(m.id), m]))
  const edges = new Map<string, Set<string>>()
  const add = (memberId: string, contactId: string) => {
    if (!byId.has(contactId)) return
    const contacts = edges.get(memberId) ?? new Set<string>()
    contacts.add(contactId); edges.set(memberId, contacts)
  }
  for (const member of members) add(String(member.owner_id), String(member.id))
  const memberIds = [...humans.keys()], slots = memberIds.map(() => '?').join(',')
  const grants = s.db.prepare(`SELECT r.requester_id,r.decider_id,r.target_contact_id,t.kind
    FROM chat_contact_requests r JOIN chat_contacts t ON t.id=r.target_contact_id
    WHERE r.status='accepted' AND (r.requester_id IN (${slots})
      OR (t.kind='human' AND r.decider_id IN (${slots})))`).all(...memberIds, ...memberIds)
  for (const grant of grants) {
    add(String(grant.requester_id), String(grant.target_contact_id))
    const reciprocal = humans.get(String(grant.requester_id))
    if (grant.kind === 'human' && reciprocal) add(String(grant.decider_id), reciprocal)
  }
  const queue = [String(owner.owner_id)], visited = new Set<string>()
  for (let i = 0; i < queue.length; i++) {
    const memberId = queue[i]!
    if (visited.has(memberId)) continue
    visited.add(memberId)
    for (const contactId of edges.get(memberId) ?? []) {
      allowed.add(contactId)
      const member = byId.get(contactId)!
      if (member.kind === 'human') queue.push(String(member.owner_id))
    }
  }
  return allowed
}
