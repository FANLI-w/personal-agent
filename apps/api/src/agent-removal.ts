import type { ChatService } from './chat.js'
import { SkillSettings } from '@research-agent-platform/contracts'
import { abortChatCall } from './continuous-chat.js'
import { fail } from './errors.js'

export function deletionOwner(s: ChatService, id: string) {
  const row = s.db.prepare('SELECT * FROM chat_contacts WHERE id=?').get(id)
  if (!row || row.owner_id !== s.c.actor.id) fail('NOT_FOUND')
  if (row.kind !== 'personal_agent' || row.principal === row.owner_id || s.directory.profile(id).role !== 'specialist') fail('FORBIDDEN')
}
export function deletePersonalAgent(s: ChatService, id: string, expectedVersion: number) {
  deletionOwner(s, id)
  const previous = s.db.prepare('SELECT * FROM deleted_personal_agents WHERE contact_id=?').get(id)
  if (previous) {
    s.c.checkVersion(Number(previous.profile_version), expectedVersion)
    return { data: { id, deletedAt: String(previous.deleted_at) } }
  }
  s.c.checkVersion(s.directory.profile(id).version, expectedVersion)
  const at = new Date().toISOString()
  // Fence before the tombstone, while existing receipt materialization is valid.
  for (const row of s.db.prepare("SELECT * FROM chat_turns WHERE json_extract(document,'$.agentContactId')=? AND status IN ('queued','running','waiting_input')").all(id)) {
    const turn = s.materializedTurn(row)
    turn.status = 'cancelled'; turn.failure = 'AUTHORITY_CHANGED'; turn.version++; turn.updatedAt = at
    s.saveTurn(turn)
    s.db.prepare('UPDATE chat_turns SET fence=fence+1,lease_owner=NULL,lease_until=NULL WHERE id=?').run(turn.id)
    abortChatCall(turn.id)
  }
  for (const row of s.db.prepare("SELECT * FROM execution_jobs WHERE kind='planning' AND json_extract(request_json,'$.colleagueBinding.contactId')=? AND status IN ('queued','running','waiting_input')").all(id)) {
    const doc = JSON.parse(String(row.document))
    doc.status = 'cancelled'; doc.failure = 'AGENT_CONTEXT_CHANGED'; doc.version++; doc.updatedAt = at
    s.db.prepare('UPDATE execution_jobs SET status=?,version=?,document=?,fence=fence+1,lease_owner=NULL,lease_until=NULL WHERE id=?').run(doc.status, doc.version, JSON.stringify(doc), row.id!)
  }
  const followups = s.db.prepare(`SELECT id FROM personal_followups WHERE json_extract(document,'$.execution.contactId')=? OR conversation_id IN
    (SELECT c.id FROM chat_conversations c JOIN chat_members m ON m.conversation_id=c.id WHERE c.kind IN ('direct','personal') AND m.contact_id=?)`).all(id, id)
  for (const followup of followups) {
    s.db.prepare("UPDATE personal_followups SET status='cancelled',version=version+1,updated_at=? WHERE id=? AND status IN ('active','paused')").run(at, followup.id!)
    // Recurring runs have their own receipts; fired_message_id alone is insufficient.
    s.db.prepare(`UPDATE im_message_outbox SET status='denied',updated_at=? WHERE status='pending' AND message_id IN
      (SELECT fired_message_id FROM personal_followups WHERE id=? UNION SELECT message_id FROM personal_followup_runs WHERE followup_id=?
       UNION SELECT notification_id FROM personal_followup_runs WHERE followup_id=?)`).run(at, followup.id!, followup.id!, followup.id!)
  }
  s.db.prepare("UPDATE im_message_outbox SET status='denied',updated_at=? WHERE status='pending' AND message_id IN (SELECT id FROM chat_messages WHERE json_extract(document,'$.senderContactId')=?)").run(at, id)
  for (const row of s.db.prepare('SELECT * FROM installed_skills WHERE owner_id=?').all(s.c.actor.id)) {
    const settings = SkillSettings.parse(JSON.parse(String(row.settings)))
    if (!settings.boundAgentIds.includes(id)) continue
    settings.boundAgentIds = settings.boundAgentIds.filter(bound => bound !== id)
    s.db.prepare('UPDATE installed_skills SET settings=?,version=version+1,updated_at=? WHERE id=?').run(JSON.stringify(settings), at, row.id!)
  }
  s.db.prepare("UPDATE chat_contact_requests SET status='revoked',version=version+1,updated_at=? WHERE target_contact_id=? AND status IN ('pending','accepted')").run(at, id)
  s.db.prepare('UPDATE agent_connections SET configured=0,enabled=0,allow_accepted_contacts=0,encrypted_api_key=NULL,last_probe_json=NULL,version=version+1,updated_at=? WHERE contact_id=?').run(at, id)
  s.db.prepare('INSERT INTO deleted_personal_agents VALUES (?,?,?,?)').run(id, s.c.actor.id, expectedVersion, at)
  s.db.prepare('UPDATE chat_contact_profiles SET version=version+1 WHERE contact_id=?').run(id)
  return { data: { id, deletedAt: at } }
}
