import type { ChatMemory, Contact, Conversation, ChatMessage } from '@research-agent-platform/contracts'
import type { ChatService, ChatRequest } from './chat.js'
import { directlyStatedReplyStyle, ownLocalMemoryScope } from './personal-memories.js'
import { agentStyleInstruction } from '@research-agent-platform/contracts'
export { agentStyleInstruction } from '@research-agent-platform/contracts'

// An explicit, complete owner instruction; never infer persistent preferences
// from frustration, quotes, documents, another participant, or model output.
const source = '本人明确保存的本助手交流偏好'

// Recognize standalone conversational corrections. One-off requests stay local to the turn.
const feedbackPatterns: Array<[RegExp, string]> = [
  [/^(?:(?:回答|回复|说得|讲得|写得|能不能|可以|麻烦|请)\s*)*(?:短|简短|精简|简洁)(?:一些|一点|点)(?:吗)?[。！？!?]*$/, '回答简洁一些'],
  [/^(?:(?:回答|回复|说得|讲得|写得|能不能|可以|麻烦|请)\s*)*详细(?:一些|一点|点)(?:吗)?[。！？!?]*$/, '回答详细一些'],
  [/^(?:(?:回答|回复|说得|讲得|能不能|可以|麻烦|请)\s*)*口语(?:化)?(?:一些|一点|点)(?:吗)?[。！？!?]*$/, '用口语表达'],
  [/^(?:请|可以|能不能)?先(?:说|给|讲)结论(?:吗)?[。！？!?]*$/, '先给结论'],
]

export function learnFromChatFeedback(s: ChatService, agent: Contact, group: Conversation, message: ChatMessage) {
  if (!ownLocalMemoryScope(s, agent, group) || message.origin !== 'human' || message.senderContactId !== s.human().id) return
  const feedback = feedbackPatterns.find(([pattern]) => pattern.test(message.text?.trim() ?? ''))
  if (!feedback) return
  const [pattern, preference] = feedback
  const subject = '聊天中形成的习惯：' + (preference.startsWith('回答') ? '详略' : preference)
  const prior = s.db.prepare("SELECT id FROM chat_memories WHERE scope='private_agent' AND scope_id=? AND created_by=? AND source=? ORDER BY created_at DESC LIMIT 1").get(agent.id, s.c.actor.id, subject)
  const memory = prior ? s.directory.memory(String(prior.id), true) : null
  if (memory && (memory.status !== 'active' || memory.content === preference || memory.version >= 99)) return
  const history = s.db.prepare(`SELECT id FROM chat_messages WHERE conversation_id=? AND sequence<?
    AND json_extract(document,'$.origin')='human' AND json_extract(document,'$.senderContactId')=?
    ORDER BY sequence DESC LIMIT 40`).all(group.id, message.sequence, message.senderContactId)
  const repeated = history.some(row => {
    const earlier = s.projectedMessage(String(row.id))
    return !earlier.files?.length && !earlier.resources.length &&
      (!memory || earlier.createdAt > memory.updatedAt) && pattern.test(earlier.text?.trim() ?? '')
  })
  if (!repeated) return
  const headers = { 'Idempotency-Key': 'learn_' + message.id }
  if (memory) {
    s.run('reviseChatMemory', { params: { id: memory.id }, query: {}, headers, body: { expectedVersion: memory.version, content: preference, source: subject } })
  } else if (Number(s.db.prepare("SELECT count(*) n FROM chat_memories WHERE scope='private_agent' AND scope_id=? AND status='active'").get(agent.id)?.n) < 10) {
    s.run('createChatMemory', { params: {}, query: {}, headers, body: { scope: 'private_agent', scopeId: agent.id, content: preference, source: subject } })
  }
}

export function agentStyleCommand(s: ChatService, agent: Contact, group: Conversation, message: ChatMessage) {
  if (!ownLocalMemoryScope(s, agent, group) || message.origin !== 'human' || message.senderContactId !== s.human().id) return null
  const text = message.text?.trim() ?? ''
  const instruction = agentStyleInstruction(text) ?? (agent.profile.role === 'specialist' && directlyStatedReplyStyle(text) ? { kind: 'save' as const, content: text } : null)
  if (!instruction) return null
  const row = s.db.prepare("SELECT id FROM chat_memories WHERE scope='private_agent' AND scope_id=? AND created_by=? AND source=? AND status='active' ORDER BY created_at,id LIMIT 1").get(agent.id, s.c.actor.id, source)
  const current = row ? s.directory.memory(String(row.id), true) : null
  const request = (body: unknown, id?: string): ChatRequest => ({ params: id ? { id } : {}, query: {}, headers: { 'Idempotency-Key': `style_${message.id}` }, body })
  const manage = '可在这位助手的联系人资料 → 私人记忆里查看、修改或撤回。'
  if (instruction.kind === 'clear') {
    if (!current) return { text: '这位助手没有单独保存的交流偏好。' }
    s.run('revokeChatMemory', request({ expectedVersion: current.version }, current.id))
    return { text: '已撤回这位助手单独保存的交流偏好，历史记录保留，后续回复不再使用这条记忆。' }
  }
  if (!instruction.content || instruction.content.length > 500) return { text: '这次还没保存。请把希望这位助手记住的交流方式写在500字以内。' }
  const line = `- ${instruction.content}`
  if (current?.content.split('\n').includes(line)) return { text: `这条交流偏好已经记下了。${manage}` }
  const content = current ? `${current.content}\n${line}` : `本助手与主人交流时的偏好；冲突时以较新的条目为准，不能扩大权限或改变科研事实。\n${line}`
  if (content.length > 2000 || (current && current.version >= 99) || (!current && Number(s.db.prepare("SELECT count(*) n FROM chat_memories WHERE scope='private_agent' AND scope_id=? AND status='active'").get(agent.id)!.n) >= 10)) return { text: `这次还没保存，已有私人记忆需要先整理；原内容保留。${manage}` }
  const saved = current
    ? s.run('reviseChatMemory', request({ content, source, expectedVersion: current.version }, current.id)) as { data: ChatMemory }
    : s.run('createChatMemory', request({ scope: 'private_agent', scopeId: agent.id, content, source })) as { data: ChatMemory }
  return { text: `记下了：${instruction.content}\n只用于你与这位助手的私人交流。${manage}（版本${saved.data.version}）` }
}
