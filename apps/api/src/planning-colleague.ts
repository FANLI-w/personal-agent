import type { ChatService } from './chat.js'
import { personalMemoryContext } from './personal-memories.js'
import { canonical } from './ai.js'
import { hash } from './auth.js'
import { fail } from './errors.js'

export type PlanningColleagueRef = { contactId: string; conversationId: string }
export type PlanningColleagueBinding = PlanningColleagueRef & { fingerprint: string }
export function planningColleagueReader(s: ChatService) {
  return (ref: PlanningColleagueRef, text: string) => {
    const context = s.directory.modelContext(ref.contactId, ref.conversationId)
    const agent = context.agent, conversation = s.conversation(ref.conversationId, false)
    if (agent.identity.kind !== 'personal_agent' || agent.identity.ownerMemberId !== s.c.actor.id || agent.profile.role !== 'specialist' || agent.agentRuntime ||
      conversation.kind !== 'direct' || conversation.ownerMemberId !== s.c.actor.id ||
      !conversation.members.some(m => m.contactId === agent.id && m.status === 'joined')) fail('NOT_FOUND')
    const personal = personalMemoryContext(s, agent, conversation, text)
    return {
      fingerprint: hash(canonical({ context: context.fingerprint, personal: personal.fingerprint })),
      requestedAgent: { id: agent.id, displayName: agent.displayName, profile: agent.profile },
      memories: context.memories,
      personalMemories: personal.records,
    }
  }
}
export type PlanningColleagueReader = ReturnType<typeof planningColleagueReader>
