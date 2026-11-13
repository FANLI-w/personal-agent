import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import type { Config } from './config.js'
import { ChatService } from './chat.js'
import { callHarness, serviceFor, type ModelCall } from './execution-worker.js'
import { compressAgent } from './assistant-memories.js'
import { personalModelKey, personalModelRuntime } from './personal-models.js'
import { waitForWorkerDatabase } from './worker-database.js'

type Job = { id: string; owner_id: string; subject_id: string }
type Note = { id: string; topic: string; summary: string; type: string }
const Groups = z.strictObject({
  groups: z.array(z.strictObject({
    topic: z.string().trim().min(1).max(80),
    ids: z.array(z.string()).min(2).max(20),
  })).max(20),
})
const compressionSystem = 'Group only notes that describe the same subject. Return strict JSON: {"groups":[{"topic":"short topic","ids":["id"]}]}. Do not merge contradictory content. Use only ids from the input. Omit groups with fewer than two ids.'

/**
 * Manual compression is queue-backed so an HTTP request never waits for a
 * model or a long compression pass. The model proposes topic groups; the
 * server applies only valid, non-conflicting groups and then runs the
 * deterministic merge.
 */
export class MemoryCompressionWorker {
  constructor(
    readonly db: DatabaseSync,
    readonly config: Config,
    readonly clock: () => number = Date.now,
    readonly call: ModelCall = callHarness,
  ) {}

  private async proposeGroups(service: ChatService, subjectId: string) {
    const notes = this.db.prepare("SELECT id,topic,summary,type FROM assistant_memories WHERE owner_id=? AND scope='agent' AND subject_id=? AND status='confirmed' AND type='note' ORDER BY updated_at DESC,id DESC LIMIT 100").all(service.c.actor.id, subjectId) as Note[]
    if (notes.length < 2) return
    const runtime = personalModelRuntime(this.db, service.c.actor, this.config)
    if (!runtime.enabled) return
    const apiKey = personalModelKey(this.db, service.c.actor, this.config)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    try {
      const result = await this.call({
        provider: runtime.provider,
        system: compressionSystem,
        prompt: JSON.stringify(notes.map(({ id, topic, summary, type }) => ({ id, topic, summary, type }))),
        model: runtime.model,
        maxTokens: 800,
        timeoutMs: 15_000,
      }, controller.signal, { apiKey })
      if (result.failure || !result.text) return
      const text = result.text.trim()
      const start = text.indexOf('{'), end = text.lastIndexOf('}')
      if (start < 0 || end <= start) return
      const parsed = Groups.safeParse(JSON.parse(text.slice(start, end + 1)))
      if (!parsed.success) return
      const byId = new Map(notes.map(note => [note.id, note]))
      const used = new Set<string>()
      for (const group of parsed.data.groups) {
        if (group.ids.some(id => !byId.has(id) || used.has(id))) continue
        for (const id of group.ids) {
          used.add(id)
          this.db.prepare("UPDATE assistant_memories SET topic=?,updated_at=? WHERE id=? AND owner_id=? AND status='confirmed'").run(group.topic, new Date(this.clock()).toISOString(), id, service.c.actor.id)
        }
      }
    } catch {
      // The deterministic pass still runs when the model is unavailable or
      // returns an unusable proposal.
    } finally {
      clearTimeout(timeout)
    }
  }

  async tick() {
    const job = this.db.prepare("SELECT id,owner_id,subject_id FROM assistant_memory_compression_jobs WHERE status='queued' ORDER BY created_at LIMIT 1").get() as Job | undefined
    if (!job) return false
    const now = new Date(this.clock()).toISOString()
    const claimed = this.db.prepare("UPDATE assistant_memory_compression_jobs SET status='running',attempts=attempts+1,lease_until=?,updated_at=? WHERE id=? AND status='queued'").run(this.clock() + 60_000, now, job.id)
    if (claimed.changes !== 1) return false
    try {
      const service = new ChatService(serviceFor(this.db, job.owner_id, this.config).c, this.config)
      await this.proposeGroups(service, job.subject_id)
      const result = compressAgent(service, job.subject_id)
      const at = new Date(this.clock()).toISOString()
      await waitForWorkerDatabase(() => this.db.prepare("UPDATE assistant_memory_compression_jobs SET status='succeeded',lease_until=NULL,result_json=?,failure=NULL,updated_at=? WHERE id=?").run(JSON.stringify(result), at, job.id))
      return true
    } catch {
      const at = new Date(this.clock()).toISOString()
      await waitForWorkerDatabase(() => this.db.prepare("UPDATE assistant_memory_compression_jobs SET status='failed',lease_until=NULL,failure='COMPRESSION_FAILED',updated_at=? WHERE id=?").run(at, job.id))
      return true
    }
  }
}
