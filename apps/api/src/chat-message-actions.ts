import { ChatMessageDetails } from '@research-agent-platform/contracts'
import type { ChatService } from './chat.js'
import { fail } from './errors.js'
import { abortChatCall } from './continuous-chat.js'

export function isMessageRetracted(s: ChatService, id: string) {
  return !!s.db.prepare('SELECT 1 FROM chat_message_retractions WHERE message_id=?').get(id)
}

export function linkMessageReply(s: ChatService, id: string, replyTo?: string) {
  if (!replyTo) return
  const source = s.projectedMessage(replyTo), target = s.projectedMessage(id)
  if (source.conversationId !== target.conversationId || source.sequence >= target.sequence || isMessageRetracted(s, replyTo)) fail('VALIDATION_ERROR')
  s.db.prepare('INSERT INTO chat_message_relations VALUES (?,?)').run(id, replyTo)
}

export function chatMessageDetails(s: ChatService, conversationId: string, id: string) {
  const message = s.projectedMessage(id)
  if (message.conversationId !== conversationId) fail('NOT_FOUND')
  const withdrawn = isMessageRetracted(s, id)
  const explicit = s.db.prepare('SELECT reply_to_id FROM chat_message_relations WHERE message_id=?').get(id)
  const answer = message.origin !== 'human' ? s.db.prepare("SELECT document FROM chat_turns WHERE conversation_id=? AND json_extract(document,'$.outputMessageId')=? ORDER BY rowid DESC LIMIT 1").get(conversationId, id) : undefined
  const sourceId = explicit?.reply_to_id ?? (answer ? JSON.parse(String(answer.document)).inputMessageId : undefined)
  let replyTo = null
  if (!withdrawn && sourceId) {
    try {
      const source = s.projectedMessage(String(sourceId))
      if (source.conversationId === conversationId) replyTo = { messageId: source.id, sequence: source.sequence, senderContactId: source.senderContactId, text: (source.text || '[附件或协作内容]').slice(0, 500), withdrawn: isMessageRetracted(s, source.id) }
    } catch { /* Lost source authority must never hide the authorized answer or expose the source. */ }
  }
  const own = message.origin === 'human' && message.senderContactId === s.human().id
  const withinWindow = s.clock() - Date.parse(message.createdAt) <= 120000
  return ChatMessageDetails.parse({ message, replyTo, withdrawn, version: withdrawn ? 2 : 1, allowedActions: own && withinWindow && !withdrawn ? ['withdraw'] : [] })
}

export function withdrawChatMessage(s: ChatService, conversationId: string, id: string, version: number) {
  const detail = chatMessageDetails(s, conversationId, id)
  s.c.checkVersion(detail.version, version)
  if (!detail.allowedActions.includes('withdraw')) fail('FORBIDDEN')
  s.db.prepare('INSERT INTO chat_message_retractions VALUES (?,?,?)').run(id, s.c.actor.id, new Date(s.clock()).toISOString())
  // Fence every sibling and every continuous batch containing the input before acknowledging.
  for (const row of s.db.prepare("SELECT * FROM chat_turns WHERE conversation_id=? AND status IN ('queued','running','waiting_input')").all(conversationId)) {
    const turn = s.materializedTurn(row), input = JSON.parse(String(row.request_json))
    if (turn.inputMessageId !== id && !input.continuous?.messageIds?.includes(id)) continue
    turn.status = 'cancelled'; turn.failure = 'INPUT_CHANGED'; turn.version++; turn.updatedAt = new Date(s.clock()).toISOString()
    s.saveTurn(turn); abortChatCall(turn.id)
  }
  return chatMessageDetails(s, conversationId, id)
}
