import type { DatabaseSync } from 'node:sqlite'
import type { Config } from './config.js'
import { ChatService } from './chat.js'
import { serviceFor } from './execution-worker.js'
import { compressAgent } from './assistant-memories.js'
import { waitForWorkerDatabase } from './worker-database.js'

type Job = { id: string; owner_id: string; subject_id: string }

/**
 * Manual compression is queue-backed so an HTTP request never waits for a
 * model or a long compression pass. Deterministic compression runs here first;
 * model-assisted topic grouping can be added behind the same job boundary.
 */
export class MemoryCompressionWorker {
  constructor(readonly db: DatabaseSync, readonly config: Config, readonly clock: () => number = Date.now) {}

  async tick() {
    const job = this.db.prepare("SELECT id,owner_id,subject_id FROM assistant_memory_compression_jobs WHERE status='queued' ORDER BY created_at LIMIT 1").get() as Job | undefined
    if (!job) return false
    const now = new Date(this.clock()).toISOString()
    const claimed = this.db.prepare("UPDATE assistant_memory_compression_jobs SET status='running',attempts=attempts+1,lease_until=?,updated_at=? WHERE id=? AND status='queued'").run(this.clock() + 60_000, now, job.id)
    if (claimed.changes !== 1) return false
    try {
      const service = new ChatService(serviceFor(this.db, job.owner_id, this.config).c, this.config)
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
