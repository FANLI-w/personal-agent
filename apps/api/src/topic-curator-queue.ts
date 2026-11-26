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

/**
 * The previous turn's curation decides whether the topic index is worth its
 * tokens: only a no-change turn suggests the conversation may have moved on.
 */
export function topicIndexWanted(db: DatabaseSync, conversationId: string) {
  const row = db.prepare("SELECT result_json FROM assistant_topic_curator_jobs WHERE conversation_id=? AND status='succeeded' ORDER BY created_at DESC,rowid DESC LIMIT 1").get(conversationId) as { result_json: string | null } | undefined
  try { return !!row?.result_json && (JSON.parse(String(row.result_json)) as { action?: string }).action === 'no_change' } catch { return false }
}
