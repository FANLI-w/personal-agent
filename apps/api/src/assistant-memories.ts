import { randomUUID } from 'node:crypto'
import {
  AssistantMemory,
  AssistantMemoryHistory,
  AssistantMemoryInput,
  AssistantMemorySettings,
  AssistantMemoryUpdate,
  assistantMemoryRoutes,
  type RequestFor,
} from '@research-agent-platform/contracts'
import { fail } from './errors.js'
import type { ChatService, ChatRequest } from './chat.js'

export const assistantMemoryCommands = Object.keys(assistantMemoryRoutes)
type Row = {
  id: string
  owner_id: string
  scope: 'personal' | 'agent'
  subject_id: string | null
  type: 'preference' | 'decision' | 'commitment' | 'note'
  status: 'candidate' | 'confirmed' | 'revoked'
  origin: 'explicit' | 'feedback' | 'inferred'
  source_kind: 'manual' | 'message' | 'task' | 'conversation'
  source_id: string | null
  source_version: number | null
  source_label: string | null
  summary: string
  detail: string | null
  payload_json: string
  version: number
  created_at: string
  updated_at: string
}
const now = () => new Date().toISOString()
const agentOwner = (s: ChatService, subjectId: string) => {
  const contact = s.contact(subjectId)
  if (contact.identity.kind !== 'personal_agent' || contact.identity.ownerMemberId !== s.c.actor.id) fail('NOT_FOUND')
}
function row(s: ChatService, id: string): Row {
  const value = s.db.prepare('SELECT * FROM assistant_memories WHERE id=? AND owner_id=?').get(id, s.c.actor.id) as Row | undefined
  if (!value) fail('NOT_FOUND')
  if (value.scope === 'agent') agentOwner(s, value.subject_id!)
  return value
}
function view(row: Row): AssistantMemory {
  const status = row.status
  return AssistantMemory.parse({
    id: row.id,
    scope: row.scope,
    subjectId: row.subject_id,
    type: row.type,
    summary: row.summary,
    detail: row.detail,
    payload: JSON.parse(String(row.payload_json)),
    source: { kind: row.source_kind, id: row.source_id, version: row.source_version, label: row.source_label },
    status,
    origin: row.origin,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    allowedActions: status === 'revoked' ? [] : status === 'candidate' ? ['edit', 'confirm', 'revoke'] : ['edit', 'revoke'],
  })
}
function revision(s: ChatService, value: AssistantMemory) {
  s.db.prepare('INSERT INTO assistant_memory_revisions VALUES(?,?,?,?)').run(value.id, value.version, JSON.stringify({ ...value, allowedActions: [] }), value.updatedAt)
}
function settings(s: ChatService): AssistantMemorySettings {
  s.db.prepare('INSERT INTO assistant_memory_settings(member_id) VALUES(?) ON CONFLICT DO NOTHING').run(s.c.actor.id)
  const r = s.db.prepare('SELECT * FROM assistant_memory_settings WHERE member_id=?').get(s.c.actor.id)!
  return AssistantMemorySettings.parse({ candidateLearning: r.candidate_learning === 1, timeZone: r.time_zone, quietHours: r.quiet_hours_json ? JSON.parse(String(r.quiet_hours_json)) : null, version: r.version })
}
function scopeInput(body: { scope?: 'personal' | 'agent'; subjectId?: string | null }) {
  if (body.scope === 'agent' && !body.subjectId) fail('VALIDATION_ERROR')
  if (body.scope !== 'agent' && body.subjectId) fail('VALIDATION_ERROR')
}
export function authorizeAssistantMemory(s: ChatService, name: string, req: ChatRequest) {
  if (req.params.id) { row(s, req.params.id); return }
  if (name === 'createAssistantMemory') {
    const body = req.body as { scope?: 'personal' | 'agent'; subjectId?: string | null }
    scopeInput(body)
    if (body.scope === 'agent') agentOwner(s, body.subjectId!)
  }
  if (name === 'assistantMemories') {
    const query = req.query as { scope?: 'personal' | 'agent'; subjectId?: string }
    if (query.scope === 'agent') { if (!query.subjectId) fail('VALIDATION_ERROR'); agentOwner(s, query.subjectId) }
  }
}
export function handleAssistantMemory(s: ChatService, name: string, req: ChatRequest): unknown {
  if (name === 'assistantMemorySettings') return { data: settings(s) }
  if (name === 'updateAssistantMemorySettings') {
    const current = settings(s), b = req.body as AssistantMemorySettings & { expectedVersion: number }
    s.c.checkVersion(current.version, b.expectedVersion)
    s.db.prepare('UPDATE assistant_memory_settings SET candidate_learning=?,time_zone=?,quiet_hours_json=?,version=version+1 WHERE member_id=?').run(b.candidateLearning ? 1 : 0, b.timeZone, b.quietHours ? JSON.stringify(b.quietHours) : null, s.c.actor.id)
    return { data: settings(s) }
  }
  if (name === 'assistantMemories') {
    const query = req.query as { scope?: 'personal' | 'agent'; subjectId?: string; status?: string }
    const scope = query.scope ?? 'personal', subject = query.subjectId ?? null
    const ids = s.db.prepare("SELECT id FROM assistant_memories WHERE owner_id=? AND scope=? AND (? IS NULL OR subject_id=?) AND (?='all' OR status=?) ORDER BY updated_at DESC,id").all(s.c.actor.id, scope, subject, subject, query.status ?? 'all', query.status ?? 'all').map(r => String(r.id))
    return s.page(name as keyof typeof assistantMemoryRoutes, req.query, ids, id => view(row(s, id)))
  }
  if (name === 'assistantMemory') return { data: view(row(s, req.params.id!)) }
  if (name === 'createAssistantMemory') {
    const body = AssistantMemoryInput.parse(req.body), created = now()
    scopeInput(body)
    if (body.scope === 'agent') agentOwner(s, body.subjectId!)
    const id = randomUUID(), at = now()
    s.db.prepare("INSERT INTO assistant_memories(id,owner_id,lab_id,scope,subject_id,type,status,origin,source_kind,source_id,source_version,source_label,summary,detail,payload_json,schema_version,version,created_at,updated_at) VALUES(?,?,?,?,?,?,'confirmed','explicit',?,?,?,?,?,?,?,1,1,?,?)").run(id, s.c.actor.id, body.scope === 'agent' ? s.c.actor.labId : null, body.scope, body.subjectId, body.type, body.source.kind, body.source.id, body.source.version, body.source.label, body.summary, body.detail, JSON.stringify(body.payload), created, at)
    const value = view(row(s, id)); revision(s, value); return { data: value }
  }
  if (name === 'updateAssistantMemory') {
    const current = view(row(s, req.params.id!)), body = AssistantMemoryUpdate.parse(req.body)
    s.c.checkVersion(current.version, body.expectedVersion)
    s.db.prepare('UPDATE assistant_memories SET type=?,summary=?,detail=?,payload_json=?,source_kind=?,source_id=?,source_version=?,source_label=?,version=version+1,updated_at=? WHERE id=?').run(body.type, body.summary, body.detail, JSON.stringify(body.payload), body.source.kind, body.source.id, body.source.version, body.source.label, now(), current.id)
    const value = view(row(s, current.id)); revision(s, value); return { data: value }
  }
  if (name === 'decideAssistantMemory') {
    const current = view(row(s, req.params.id!)), b = req.body as { expectedVersion: number; decision: 'confirm' | 'revoke' }
    s.c.checkVersion(current.version, b.expectedVersion)
    if (b.decision === 'revoke' && current.status === 'revoked') fail('INVALID_STATE')
    if (b.decision === 'confirm' && current.status !== 'candidate') fail('INVALID_STATE')
    s.db.prepare('UPDATE assistant_memories SET status=?,version=version+1,updated_at=? WHERE id=?').run(b.decision === 'confirm' ? 'confirmed' : 'revoked', now(), current.id)
    const value = view(row(s, current.id)); revision(s, value); return { data: value }
  }
  if (name === 'assistantMemoryHistory') {
    const memory = view(row(s, req.params.id!))
    const revisions = s.db.prepare('SELECT document FROM assistant_memory_revisions WHERE memory_id=? ORDER BY version').all(memory.id).flatMap(r => {
      const parsed = AssistantMemory.safeParse(JSON.parse(String(r.document)))
      return parsed.success ? [{ ...parsed.data, allowedActions: [] }] : []
    })
    return { data: AssistantMemoryHistory.parse({ memory, revisions }) }
  }
  fail('NOT_IMPLEMENTED')
}
export function assistantMemoryReplay(s: ChatService, name: string, previous: unknown): unknown {
  if (name === 'assistantMemorySettings' || name === 'updateAssistantMemorySettings') return { data: settings(s) }
  const value = previous as { data?: { id?: string } }
  if (value.data?.id) return { data: view(row(s, String(value.data.id))) }
  return previous
}
