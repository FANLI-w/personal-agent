import { enqueueFeedback } from './feedback-queue.js'
import { GroupAgentStatus } from '@research-agent-platform/contracts'
import type { Conversation, SendChatMessage } from '@research-agent-platform/contracts'
import type { ChatService, TurnInput } from './chat.js'
import { fail } from './errors.js'
import {linkMessageReply} from './chat-message-actions.js'

/** Plain @ chat also exists in legacy lab groups, independent of group storage. */
export function addressedGroupChat(group: Conversation, input: SendChatMessage) {
  const ids = input.agentContactIds ?? [input.agentContactId]
  return group.kind === 'group' && (input.context?.length ?? 0) === 0 &&
    ids.every(id => !!id && (input.mentions ?? []).some(mention => mention.contactId === id))
}

/** The route transaction rolls back the whole batch if any member or capacity check fails. */
export function sendGroupAgents(s: ChatService, group: Conversation, input: SendChatMessage) {
  const ids = input.agentContactIds!
  if(ids.length!==1)fail('GROUP_AGENT_NOT_ALLOWED')
  if (group.kind !== 'group' || input.intent !== 'ask_agent' || !input.budget) fail('VALIDATION_ERROR')
  for (const id of ids) {
    const agent = s.joinedAgent(group, id)
    if (agent.agentRuntime) fail('EXTERNAL_SCOPE_UNSUPPORTED')
  }
  const tokens = input.budget.maxTokens
  const seconds = input.budget.maxSeconds
  if (tokens < 1 || seconds < 1) fail('VALIDATION_ERROR')
  // A linked work item has one primary request, not a new work item per mention.
  // Capture its version once so siblings do not invalidate each other's fence.
  const message = s.message(group.id, {
    senderContactId:s.human().id, origin:'human', text:input.text,
    mentions:input.mentions ?? [], resources:input.context ?? [], actionIds:[], turnId:null,
  })
  linkMessageReply(s,message.id,input.replyToMessageId)
  enqueueFeedback(s.db, s.c.actor.id, s.c.labId, group.id, 'chat', message.id)
  const turns = ids.map(id => {
    const request: TurnInput = {
      budget:{maxTokens:tokens,maxSeconds:seconds}, context:input.context ?? [],
      conversationVersion:group.version, inputSequence:message.sequence,
      dailyChat:true,
    }
    const turn = s.newTurn(group, message, id, request)
    return turn
  })
  message.turnId = turns[0]!.id
  const { files: _files, ...legacy } = message
  s.db.prepare('UPDATE chat_messages SET document=? WHERE id=?').run(JSON.stringify(legacy), message.id)
  return {data:{message:s.projectedMessage(message.id),turn:turns[0]!,turns}}
}

/** Public group receipt, without private input, receipts, accounting or controls. */
export function groupMessageStatuses(s: ChatService, conversationId: string, messageId: string) {
  const group = s.conversation(conversationId, false)
  if (group.kind !== 'group') fail('NOT_FOUND')
  const message = s.projectedMessage(messageId)
  if (message.conversationId !== group.id) fail('NOT_FOUND')
  const rows = s.db.prepare(`SELECT * FROM chat_turns WHERE conversation_id=?
    AND (json_extract(document,'$.inputMessageId')=? OR json_extract(document,'$.outputMessageId')=?)
    ORDER BY rowid DESC`).all(group.id, message.id, message.id)
  const roots = new Set<string>()
  const requests: GroupAgentStatus[] = []
  for (const row of rows) {
    const root = String(row.root_id)
    if (roots.has(root)) continue
    roots.add(root)
    try {
      const { turn } = s.checkTurnInput(String(row.id), false)
      const agent = s.joinedAgent(group, turn.agentContactId)
      requests.push(GroupAgentStatus.parse({
        id:turn.id,agentContactId:turn.agentContactId,displayName:agent.displayName,
        status:turn.status,failure:turn.failure,outputMessageId:turn.outputMessageId,updatedAt:turn.updatedAt,
      }))
    } catch { /* Do not bypass revoked membership or material access. */ }
  }
  return {data:{requests:requests.reverse().slice(0, 5)}}
}
