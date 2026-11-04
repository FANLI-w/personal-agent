import { createHash } from 'node:crypto'
import { TranscriptSyncInput, type TranscriptSnapshot } from '@research-agent-platform/contracts'
import type { ChatService } from './chat.js'
import { chatMessageDetails } from './chat-message-actions.js'
import { groupMessageStatuses } from './group-agent-message.js'
import { ApiError, fail } from './errors.js'

export function syncTranscript(s: ChatService, conversationId: string, known: string) {
  let input: ReturnType<typeof TranscriptSyncInput.parse>
  try { input = TranscriptSyncInput.parse(JSON.parse(known)) } catch { fail('VALIDATION_ERROR') }
  if (new Set(input.map(item => item.messageId)).size !== input.length) fail('VALIDATION_ERROR')
  const group = s.conversation(conversationId, false)
  const changes: TranscriptSnapshot[] = [], unavailableIds: string[] = []
  for (const item of input) {
    try {
      const details = chatMessageDetails(s, group.id, item.messageId)
      const requests = !details.withdrawn && group.kind === 'group' ? groupMessageStatuses(s, group.id, item.messageId).data.requests : []
      const ids = new Set([...requests.map(request => request.id), ...(details.message.turnId ? [details.message.turnId] : [])])
      const turns = [...ids].flatMap(id => {
        // Never probe somebody else's private turn through this batch route.
        const row = s.db.prepare('SELECT owner_id FROM chat_turns WHERE id=? AND conversation_id=?').get(id, group.id)
        if (row?.owner_id !== s.c.actor.id) return []
        try { return [s.turn(id)] } catch (error) { if (error instanceof ApiError) return []; throw error }
      }).slice(0, 5)
      const payload = { details, requests, turns }
      const revision = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
      if (revision !== item.revision) changes.push({ ...payload, revision })
    } catch (error) {
      if (!(error instanceof ApiError) || !['NOT_FOUND', 'FORBIDDEN'].includes(error.code)) throw error
      unavailableIds.push(item.messageId)
    }
  }
  return { data: { changes, unavailableIds } }
}
