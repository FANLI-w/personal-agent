import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

/**
 * One curator job per assistant turn. The unique turn_id makes the insert
 * idempotent when a retried turn finalizes twice.
 */
export function queueTopicCuration(db: DatabaseSync, ownerId: string, assistantId: string, conversationId: string, turnId: string) {
  const at = new Date().toISOString()
  db.prepare("INSERT INTO assistant_topic_curator_jobs(id,owner_id,assistant_id,conversation_id,turn_id,status,created_at,updated_at) VALUES(?,?,?,?,?,'queued',?,?) ON CONFLICT(turn_id) DO NOTHING")
    .run(randomUUID(), ownerId, assistantId, conversationId, turnId, at, at)
}
