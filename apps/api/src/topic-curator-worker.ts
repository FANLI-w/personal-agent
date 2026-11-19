import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { AssistantTopicBody } from '@research-agent-platform/contracts'
import type { Config } from './config.js'
import { transaction } from './database.js'
import { ChatService, type TurnInput } from './chat.js'
import { isMessageRetracted } from './chat-message-actions.js'
import { callHarness, serviceFor, type ModelCall } from './execution-worker.js'
import { applyTopicPatch, createTopic, pauseActiveTopic } from './assistant-topics.js'
import { personalModelKey, personalModelRuntime } from './personal-models.js'
import { curatorSystem } from './topic-curator-prompt.js'
import { waitForWorkerDatabase } from './worker-database.js'

type Job = { id: string; owner_id: string; assistant_id: string; conversation_id: string; turn_id: string; attempts: number }

const BodyPatch = z.strictObject({
  context: AssistantTopicBody.shape.context.removeDefault().optional(),
  decisions: AssistantTopicBody.shape.decisions.removeDefault().optional(),
  openQuestions: AssistantTopicBody.shape.openQuestions.removeDefault().optional(),
  next: AssistantTopicBody.shape.next.removeDefault().optional(),
  constraints: AssistantTopicBody.shape.constraints.removeDefault().optional(),
})
const CuratorOutput = z.strictObject({
  action: z.enum(['update_topic', 'new_topic', 'no_change']),
  topicId: z.string().min(1).max(96).optional(),
  baseVersion: z.number().int().nonnegative().optional(),
  title: z.string().trim().min(1).max(60).optional(),
  summary: z.string().trim().min(1).max(300).optional(),
  body: BodyPatch.optional(),
  reason: z.enum(['smalltalk', 'duplicate', 'no_increment']).optional(),
  hint: z.literal('preference').optional(),
})
type CuratorOutput = z.infer<typeof CuratorOutput>
type Result = { action: string; topicId?: string; version?: number; reason?: string; hint?: string }

const leaseMs = 60_000
const maxTokens = 1200

/** Parse the first JSON object from a model reply; anything outside braces is ignored. */
function parseOutput(text: string): CuratorOutput {
  const start = text.indexOf('{'), end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('INVALID_MODEL_OUTPUT')
  const parsed = CuratorOutput.safeParse(JSON.parse(text.slice(start, end + 1)))
  if (!parsed.success) throw new Error('INVALID_MODEL_OUTPUT')
  return parsed.data
}

/** Asynchronous topic curator. It never runs inside a chat turn and never blocks replies. */
export class TopicCuratorWorker {
  constructor(readonly db: DatabaseSync, readonly config: Config,
    readonly clock: () => number = Date.now, readonly call: ModelCall = callHarness, readonly modelTimeoutMs = 20_000) {}

  private owns(job: Job) {
    return !!this.db.prepare("SELECT 1 FROM assistant_topic_curator_jobs WHERE id=? AND status='running' AND attempts=? AND lease_until>?").get(job.id, job.attempts, this.clock())
  }

  private service(job: Job) {
    return new ChatService(serviceFor(this.db, job.owner_id, this.config).c, this.config)
  }

  private input(service: ChatService, job: Job) {
    const saved = service.db.prepare("SELECT document,request_json FROM chat_turns WHERE id=? AND owner_id=? AND conversation_id=? AND status='succeeded'")
      .get(job.turn_id, job.owner_id, job.conversation_id)
    if (!saved) return
    const turn = JSON.parse(String(saved.document)) as { agentContactId: string; inputMessageId: string; outputMessageId: string }
    const conversation = service.conversation(job.conversation_id, false)
    if (conversation.kind !== 'personal' || conversation.ownerMemberId !== job.owner_id || turn.agentContactId !== job.assistant_id || !turn.outputMessageId) return
    const input = service.projectedMessage(turn.inputMessageId), reply = service.projectedMessage(turn.outputMessageId)
    const humanId = service.human().id
    if (input.conversationId !== conversation.id || reply.conversationId !== conversation.id ||
      input.origin !== 'human' || input.senderContactId !== humanId ||
      reply.origin !== 'model' || reply.senderContactId !== job.assistant_id ||
      isMessageRetracted(service, input.id) || isMessageRetracted(service, reply.id)) return

    const topic = service.db.prepare("SELECT id,version,title,summary,body_json FROM assistant_topics WHERE owner_id=? AND assistant_id=? AND state='active'").get(job.owner_id, job.assistant_id) as
      { id: string; version: number; title: string; summary: string; body_json: string } | undefined
    const currentTopic = topic ? { id: String(topic.id), version: Number(topic.version), title: String(topic.title), summary: String(topic.summary), body: JSON.parse(String(topic.body_json)) as unknown } : null
    const request = JSON.parse(String(saved.request_json)) as Pick<TurnInput, 'continuous'>
    const currentIds = request.continuous?.messageIds ?? [input.id]
    const ids = service.db.prepare('SELECT id FROM chat_messages WHERE conversation_id=? AND sequence<? ORDER BY sequence DESC LIMIT ?')
      .all(job.conversation_id, input.sequence, Math.max(0, 9 - currentIds.length)).map(value => String(value.id)).reverse()
    ids.push(...currentIds)
    ids.push(reply.id)
    const messages = ids.flatMap(id => {
      try {
        if (isMessageRetracted(service, id)) return []
        const message = service.projectedMessage(id)
        const ownInput = message.origin === 'human' && message.senderContactId === humanId
        const ownReply = message.origin === 'model' && message.senderContactId === job.assistant_id
        return message.conversationId === conversation.id && message.text && (ownInput || ownReply)
          ? [{ id: message.id, role: ownInput ? 'user' : 'assistant', text: message.text.slice(0, 1500) }]
          : []
      } catch { return [] }
    })
    return { currentTopic, messages }
  }

  private async complete(prepared: { prompt: string; runtime: ReturnType<typeof personalModelRuntime>; apiKey: string | undefined }, signal: AbortSignal) {
    let deadline: ReturnType<typeof setTimeout> | undefined
    let abort: (() => void) | undefined
    try {
      const call = this.call({ provider: prepared.runtime.provider, ...(prepared.runtime.provider === 'deepseek' ? { reasoningEffort: 'off' as const } : {}), system: curatorSystem, prompt: prepared.prompt,
        model: prepared.runtime.model, maxTokens, timeoutMs: this.modelTimeoutMs }, signal, { apiKey: prepared.apiKey! })
      const stopped = new Promise<undefined>(resolve => {
        abort = () => resolve(undefined)
        deadline = setTimeout(abort, this.modelTimeoutMs)
        if (signal.aborted) abort()
        else signal.addEventListener('abort', abort, { once: true })
      })
      const result = await Promise.race([call, stopped])
      if (!result || result.failure || !result.text) return undefined
      return result.text
    } finally {
      clearTimeout(deadline)
      if (abort) signal.removeEventListener('abort', abort)
    }
  }

  private apply(service: ChatService, job: Job, output: CuratorOutput): Result {
    if (output.action === 'no_change') return { action: 'no_change', reason: output.reason ?? 'no_increment', ...(output.hint ? { hint: output.hint } : {}) }
    if (output.action === 'update_topic') {
      if (!output.topicId || output.baseVersion === undefined) throw new Error('INVALID_MODEL_OUTPUT')
      const topic = service.db.prepare('SELECT version,state FROM assistant_topics WHERE id=? AND owner_id=? AND assistant_id=?').get(output.topicId, job.owner_id, job.assistant_id) as
        { version: number; state: string } | undefined
      if (!topic || topic.state === 'closed') return { action: 'stale', topicId: output.topicId }
      // A newer patch already won; the model output is dropped rather than replayed.
      if (Number(topic.version) !== output.baseVersion) return { action: 'stale', topicId: output.topicId }
      const value = applyTopicPatch(service, { topicId: output.topicId, baseVersion: output.baseVersion, title: output.title, summary: output.summary, body: output.body }, { agent: 'assistant' })
      return { action: 'update_topic', topicId: value.id, version: value.version }
    }
    if (!output.title || !output.summary) throw new Error('INVALID_MODEL_OUTPUT')
    pauseActiveTopic(service, job.assistant_id, { agent: 'assistant' })
    const created = createTopic(service, {
      assistantId: job.assistant_id, title: output.title, summary: output.summary,
      body: AssistantTopicBody.parse(output.body ?? {}),
    }, 'curator', { agent: 'assistant' }, 'provisional')
    return { action: 'new_topic', topicId: created.id, version: created.version }
  }

  private finish(job: Job, result: Result) {
    const at = new Date(this.clock()).toISOString()
    this.db.prepare("UPDATE assistant_topic_curator_jobs SET status='succeeded',lease_until=NULL,result_json=?,failure=NULL,updated_at=? WHERE id=? AND status='running' AND attempts=? AND lease_until>?")
      .run(JSON.stringify(result), at, job.id, job.attempts, this.clock())
  }

  private fail(job: Job, failure: string) {
    const at = new Date(this.clock()).toISOString()
    this.db.prepare("UPDATE assistant_topic_curator_jobs SET status='failed',lease_until=NULL,failure=?,updated_at=? WHERE id=? AND status='running' AND attempts=? AND lease_until>?")
      .run(failure, at, job.id, job.attempts, this.clock())
  }

  async tick(): Promise<boolean> {
    const job = await waitForWorkerDatabase(() => transaction(this.db, () => {
      const at = new Date(this.clock()).toISOString()
      this.db.prepare("UPDATE assistant_topic_curator_jobs SET status='failed',lease_until=NULL,failure='LEASE_EXPIRED',updated_at=? WHERE status='running' AND COALESCE(lease_until,0)<=? AND attempts>=3").run(at, this.clock())
      this.db.prepare("UPDATE assistant_topic_curator_jobs SET status='queued',lease_until=NULL,failure=NULL,updated_at=? WHERE status='running' AND COALESCE(lease_until,0)<=? AND attempts<3").run(at, this.clock())
      const next = this.db.prepare("SELECT id,owner_id,assistant_id,conversation_id,turn_id,attempts FROM assistant_topic_curator_jobs WHERE status='queued' ORDER BY created_at,id LIMIT 1").get() as Job | undefined
      if (!next) return
      const claimed = this.db.prepare("UPDATE assistant_topic_curator_jobs SET status='running',attempts=attempts+1,lease_until=?,updated_at=? WHERE id=? AND status='queued' AND attempts=?").run(this.clock() + leaseMs, at, next.id, next.attempts)
      return claimed.changes === 1 ? { ...next, attempts: next.attempts + 1 } : undefined
    }))
    if (!job) return false
    const controller = new AbortController()
    let heartbeatFlight: Promise<void> | undefined
    const heartbeat = setInterval(() => {
      if (heartbeatFlight) return
      heartbeatFlight = waitForWorkerDatabase(() => {
        const at = this.clock()
        const renewed = this.db.prepare('UPDATE assistant_topic_curator_jobs SET lease_until=?,updated_at=? WHERE id=? AND status=\'running\' AND attempts=? AND lease_until>?').run(at + leaseMs, new Date(at).toISOString(), job.id, job.attempts, at)
        if (renewed.changes !== 1) controller.abort()
      }).catch(() => controller.abort()).finally(() => { heartbeatFlight = undefined })
    }, 10_000)
    let phase: 'model' | 'apply' = 'model'
    try {
      const prepared = await waitForWorkerDatabase(() => transaction(this.db, () => {
        if (!this.owns(job)) return { owned: false as const }
        const service = this.service(job), runtime = personalModelRuntime(this.db, service.c.actor, this.config)
        if (!runtime.enabled || runtime.source !== 'personal') return { owned: true as const, enabled: false as const }
        const input = this.input(service, job)
        return { owned: true as const, enabled: true as const, runtime, input, prompt: JSON.stringify(input), apiKey: input ? personalModelKey(this.db, service.c.actor, this.config) : undefined }
      }))
      if (!prepared.owned) return true
      if (!prepared.enabled) { await waitForWorkerDatabase(() => this.fail(job, 'MODEL_UNAVAILABLE')); return true }
      if (!prepared.input) { await waitForWorkerDatabase(() => this.finish(job, { action: 'stale' })); return true }
      const text = await this.complete(prepared, controller.signal)
      if (!text) { await waitForWorkerDatabase(() => this.fail(job, 'MODEL_UNAVAILABLE')); return true }
      const output = parseOutput(text)
      phase = 'apply'
      await waitForWorkerDatabase(() => transaction(this.db, () => {
        if (!this.owns(job)) return
        const service = this.service(job)
        const activeId = prepared.input?.currentTopic?.id
        const runtime = personalModelRuntime(this.db, service.c.actor, this.config)
        const stale = JSON.stringify(this.input(service, job)) !== prepared.prompt ||
          !runtime.enabled || runtime.fingerprint !== prepared.runtime.fingerprint ||
          (output.action === 'update_topic' && output.topicId !== activeId)
        this.finish(job, stale ? { action: 'stale' } : this.apply(service, job, output))
      }))
    } catch {
      await waitForWorkerDatabase(() => this.fail(job, phase === 'apply' ? 'CURATOR_APPLY_FAILED' : 'INVALID_MODEL_OUTPUT'))
    } finally {
      clearInterval(heartbeat); controller.abort(); await heartbeatFlight
    }
    return true
  }
}
