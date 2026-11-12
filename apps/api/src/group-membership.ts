import type {ChatService} from './chat.js'

/** Direct joined membership is the group-history grant. Friendship/lab membership
 * authorizes inviting, not continued sponsorship through a particular owner.
 * Transferring ownership or leaving cannot silently evict remaining humans.
 * This grants no task, material, private history or personal-memory authority.
 */
export function socialGroupContacts(s:ChatService,conversationId:string){
  return new Set(s.db.prepare(`SELECT c.id FROM chat_members m JOIN chat_contacts c ON c.id=m.contact_id
    JOIN auth_accounts a ON a.member_id=c.owner_id AND a.disabled=0
    WHERE m.conversation_id=? AND m.status='joined' AND
    (c.kind='human' OR (c.kind='public_agent' AND c.principal='group:'||m.conversation_id))`).all(conversationId).map(row=>String(row.id)))
}
