import { randomUUID } from 'node:crypto'
import {
  AssistantTopic,
  AssistantTopicBody,
  AssistantTopicHistory,
  AssistantTopicIndex,
  AssistantTopicInput,
  AssistantTopicUpdate,
  assistantTopicRoutes,
  type AssistantTopic as AssistantTopicValue,
} from '@research-agent-platform/contracts'
import type { ActorFacts } from '@research-agent-platform/constitution'
import { fail } from './errors.js'
import { assertAllowed } from './subjects.js'
import type { ChatService, ChatRequest } from './chat.js'

export const assistantTopicCommands = Object.keys(assistantTopicRoutes)

type Row = {
  id: string
  owner_id: string
  assistant_id: string
  title: string
  title_status: 'provisional' | 'final'
  summary: string
  body_json: string
  state: 'active' | 'paused' | 'closed'
  origin: 'curator' | 'owner'
  version: number
  created_at: string
  updated_at: string
  last_active_at: string
}

/** Curator writes through this shape; it never carries a caller-chosen version. */
export type AssistantTopicPatch = {
  topicId: string
  baseVersion?: number
  title?: string
  summary?: string
  body?: Partial<AssistantTopicBody>
}

const now = () => new Date().toISOString()
const bodyBytes = (body: AssistantTopicBody) => Buffer.byteLength(JSON.stringify(body), 'utf8')
const bodyLimit = 4_000
const noteLimit = 10
const key = (text: string) => text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
const importanceRank = { low: 0, medium: 1, high: 2 } as const

export function agentOwner(s: ChatService, assistantId: string) {
  const contact = s.contact(assistantId)
  if (contact.identity.kind !== 'personal_agent' || contact.identity.ownerMemberId !== s.c.actor.id) fail('NOT_FOUND')
}

function row(s: ChatService, id: string): Row {
  const value = s.db.prepare('SELECT * FROM assistant_topics WHERE id=? AND owner_id=?').get(id, s.c.actor.id) as Row | undefined
  if (!value) fail('NOT_FOUND')
  agentOwner(s, value.assistant_id)
  return value
}

const bodyOf = (value: Row) => AssistantTopicBody.parse(JSON.parse(String(value.body_json)))

function view(value: Row): AssistantTopicValue {
  const state = value.state
  return AssistantTopic.parse({
    id: value.id,
    assistantId: value.assistant_id,
    title: value.title,
    titleStatus: value.title_status,
    summary: value.summary,
    body: bodyOf(value),
    state,
    origin: value.origin,
    version: value.version,
    lastActiveAt: value.last_active_at,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    allowedActions: state === 'closed' ? [] : state === 'paused' ? ['edit', 'close', 'resume'] : ['edit', 'close'],
  })
}

function indexView(value: Row): unknown {
  return AssistantTopicIndex.parse({
    id: value.id,
    assistantId: value.assistant_id,
    title: value.title,
    titleStatus: value.title_status,
    summary: value.summary,
    state: value.state,
    origin: value.origin,
    version: value.version,
    lastActiveAt: value.last_active_at,
    updatedAt: value.updated_at,
  })
}

function revision(s: ChatService, value: AssistantTopicValue) {
  s.db.prepare('INSERT INTO assistant_topic_revisions VALUES(?,?,?,?)').run(value.id, value.version, JSON.stringify({ ...value, allowedActions: [] }), value.updatedAt)
}

const uniqueTexts = (values: string[], limit: number) => {
  const seen = new Set<string>(), out: string[] = []
  for (const value of values) {
    const normalized = key(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(value.trim())
    if (out.length === limit) break
  }
  return out
}

/** Owner edits replace the sections they send; dedupe and caps still apply. */
function replaceBody(current: AssistantTopicBody, patch: Partial<AssistantTopicBody>): AssistantTopicBody {
  return AssistantTopicBody.parse({
    context: patch.context ?? current.context,
    decisions: patch.decisions ? mergeDecisions([], patch.decisions) : current.decisions,
    openQuestions: patch.openQuestions ? uniqueTexts(patch.openQuestions, 10) : current.openQuestions,
    next: patch.next ? uniqueTexts(patch.next, 10) : current.next,
    constraints: patch.constraints ? uniqueTexts(patch.constraints, 10) : current.constraints,
    notes: patch.notes ? mergeNotes([], patch.notes) : current.notes,
  })
}

/** Curator patches merge by text: existing entries survive, unchanged sections stay as they are. */
function mergeBody(current: AssistantTopicBody, patch: Partial<AssistantTopicBody>): AssistantTopicBody {
  return AssistantTopicBody.parse({
    context: patch.context ?? current.context,
    decisions: patch.decisions ? mergeDecisions(current.decisions, patch.decisions) : current.decisions,
    openQuestions: patch.openQuestions ? uniqueTexts([...current.openQuestions, ...patch.openQuestions], 10) : current.openQuestions,
    next: patch.next ? uniqueTexts([...current.next, ...patch.next], 10) : current.next,
    constraints: patch.constraints ? uniqueTexts([...current.constraints, ...patch.constraints], 10) : current.constraints,
    notes: patch.notes ? mergeNotes(current.notes, patch.notes) : current.notes,
  })
}

/** Counts sections with substantive changes; obsolete and superseded entries do not count. */
function changedSections(before: AssistantTopicBody, after: AssistantTopicBody) {
  const active = (values: { status: string }[]) => values.filter(value => value.status !== 'obsolete' && value.status !== 'superseded')
  let count = 0
  if (before.context !== after.context) count += 1
  if (JSON.stringify(active(before.decisions)) !== JSON.stringify(active(after.decisions))) count += 1
  if (JSON.stringify(active(before.notes)) !== JSON.stringify(active(after.notes))) count += 1
  if (JSON.stringify(before.openQuestions) !== JSON.stringify(after.openQuestions)) count += 1
  if (JSON.stringify(before.next) !== JSON.stringify(after.next)) count += 1
  if (JSON.stringify(before.constraints) !== JSON.stringify(after.constraints)) count += 1
  return count
}

function mergeDecisions(current: AssistantTopicBody['decisions'], incoming: AssistantTopicBody['decisions']) {
  const merged = new Map(current.map(decision => [key(decision.text), { ...decision }]))
  for (const decision of incoming) {
    const normalized = key(decision.text)
    const prior = merged.get(normalized)
    merged.set(normalized, prior ? { text: prior.text, status: decision.status } : { ...decision })
  }
  return [...merged.values()].slice(-20)
}

function mergeNotes(current: AssistantTopicBody['notes'], incoming: AssistantTopicBody['notes']) {
  const merged = new Map(current.map(note => [key(note.text), { ...note }]))
  for (const note of incoming) {
    const normalized = key(note.text)
    const prior = merged.get(normalized)
    merged.set(normalized, prior ? { ...prior, kind: note.kind, importance: note.importance, status: note.status } : { ...note })
  }
  const values = [...merged.values()]
  if (values.length <= noteLimit) return values
  // Oldest obsolete entries leave the array first; their text stays in the revision.
  return values.filter(note => note.status !== 'obsolete').sort((a, b) => importanceRank[b.importance] - importanceRank[a.importance]).slice(0, noteLimit)
}

const hasSubstance = (body: AssistantTopicBody) => body.decisions.some(decision => decision.status === 'confirmed') || body.constraints.length > 0

function nextTitleStatus(current: Row, title: string | undefined, body: AssistantTopicBody) {
  if (title !== undefined && title !== current.title) return 'provisional' as const
  return hasSubstance(body) ? 'final' as const : current.title_status
}

function assertBody(body: AssistantTopicBody) {
  if (bodyBytes(body) > bodyLimit) fail('PAYLOAD_TOO_LARGE')
}

function write(s: ChatService, value: Row, patch: { title?: string; summary?: string; body?: AssistantTopicBody; state?: Row['state']; origin: Row['origin']; active?: boolean }, at = now()) {
  const body = patch.body ?? bodyOf(value)
  assertBody(body)
  const title = patch.title ?? value.title
  const summary = patch.summary ?? value.summary
  const next = {
    title,
    title_status: patch.title !== undefined || patch.body !== undefined ? nextTitleStatus(value, patch.title, body) : value.title_status,
    summary,
    body_json: JSON.stringify(body),
    state: patch.state ?? value.state,
    origin: patch.origin,
    version: value.version + 1,
    updated_at: at,
    last_active_at: patch.active === false ? value.last_active_at : at,
  }
  s.db.prepare('UPDATE assistant_topics SET title=?,title_status=?,summary=?,body_json=?,state=?,origin=?,version=?,updated_at=?,last_active_at=? WHERE id=? AND owner_id=? AND version=?')
    .run(next.title, next.title_status, next.summary, next.body_json, next.state, next.origin, next.version, next.updated_at, next.last_active_at, value.id, s.c.actor.id, value.version)
  const updated = row(s, value.id)
  revision(s, view(updated))
  return updated
}

export function createTopic(s: ChatService, input: AssistantTopicInput, origin: Row['origin'], subject: ActorFacts, titleStatus: Row['title_status'] = 'final') {
  assertAllowed('personal', 'memory', subject, 'write')
  agentOwner(s, input.assistantId)
  assertBody(input.body)
  const existing = s.db.prepare("SELECT id FROM assistant_topics WHERE owner_id=? AND assistant_id=? AND state='active'").get(s.c.actor.id, input.assistantId)
  if (existing) fail('INVALID_STATE')
  const id = randomUUID(), at = now()
  s.db.prepare('INSERT INTO assistant_topics(id,owner_id,assistant_id,title,title_status,summary,body_json,state,origin,version,created_at,updated_at,last_active_at) VALUES(?,?,?,?,?,?,?,\'active\',?,1,?,?,?)')
    .run(id, s.c.actor.id, input.assistantId, input.title, titleStatus, input.summary, JSON.stringify(input.body), origin, at, at, at)
  const created = row(s, id)
  revision(s, view(created))
  return created
}

/** Curator-only merge path. It records origin='curator' and never trusts a caller version. */
export function applyTopicPatch(s: ChatService, patch: AssistantTopicPatch, subject: ActorFacts) {
  assertAllowed('personal', 'memory', subject, 'write')
  const current = row(s, patch.topicId)
  if (current.state === 'closed') fail('INVALID_STATE')
  if (patch.baseVersion !== undefined && current.version !== patch.baseVersion) fail('VERSION_CONFLICT')
  const before = bodyOf(current), body = mergeBody(before, patch.body ?? {})
  // A single-section edit keeps the old summary and title; two or more substantive
  // section changes accept the model's rewrite. Owner edits are not gated.
  const accept = changedSections(before, body) >= 2
  return write(s, current, { title: accept ? patch.title : undefined, summary: accept ? patch.summary : undefined, body, origin: 'curator' })
}

/** Curator switching topics pauses the old active one; closed topics are never injected. */
export function pauseActiveTopic(s: ChatService, assistantId: string, subject: ActorFacts, origin: Row['origin'] = 'curator') {
  assertAllowed('personal', 'memory', subject, 'write')
  agentOwner(s, assistantId)
  const current = s.db.prepare("SELECT * FROM assistant_topics WHERE owner_id=? AND assistant_id=? AND state='active'").get(s.c.actor.id, assistantId) as Row | undefined
  if (!current) return undefined
  return write(s, current, { state: 'paused', origin, active: false })
}

export function ensureActiveTopic(s: ChatService, assistantId: string, title: string, summary: string, subject: ActorFacts) {
  assertAllowed('personal', 'memory', subject, 'write')
  agentOwner(s, assistantId)
  const existing = s.db.prepare("SELECT * FROM assistant_topics WHERE owner_id=? AND assistant_id=? AND state='active'").get(s.c.actor.id, assistantId) as Row | undefined
  if (existing) return existing
  return createTopic(s, { assistantId, title, summary, body: AssistantTopicBody.parse({}) }, 'curator', subject)
}

export function authorizeAssistantTopic(s: ChatService, name: string, req: ChatRequest) {
  if (req.params.id) { row(s, req.params.id); return }
  const body = (req.body ?? {}) as { assistantId?: string }
  const query = (req.query ?? {}) as { assistantId?: string }
  const assistantId = body.assistantId ?? query.assistantId
  if (!assistantId) fail('VALIDATION_ERROR')
  agentOwner(s, assistantId)
  if (name === 'createAssistantTopic') assertAllowed('personal', 'memory', { owner: true }, 'write')
}

export function handleAssistantTopic(s: ChatService, name: string, req: ChatRequest): unknown {
  if (name === 'assistantTopics') {
    const query = req.query as { assistantId: string; state?: string }
    const ids = s.db.prepare("SELECT id FROM assistant_topics WHERE owner_id=? AND assistant_id=? AND (?='all' OR state=?) ORDER BY CASE state WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,last_active_at DESC,id DESC")
      .all(s.c.actor.id, query.assistantId, query.state ?? 'all', query.state ?? 'all').map(value => String(value.id))
    return s.page(name as keyof typeof assistantTopicRoutes, req.query, ids, id => indexView(row(s, id)))
  }
  if (name === 'assistantTopic') return { data: view(row(s, req.params.id!)) }
  if (name === 'createAssistantTopic') {
    const input = AssistantTopicInput.parse(req.body)
    return { data: view(createTopic(s, input, 'owner', { owner: true })) }
  }
  if (name === 'updateAssistantTopic') {
    const current = row(s, req.params.id!), input = AssistantTopicUpdate.parse(req.body)
    if (current.state === 'closed') fail('INVALID_STATE')
    s.c.checkVersion(current.version, input.expectedVersion)
    const body = replaceBody(bodyOf(current), input.body ?? {})
    return { data: view(write(s, current, { title: input.title, summary: input.summary, body, origin: 'owner' })) }
  }
  if (name === 'closeAssistantTopic') {
    const current = row(s, req.params.id!), input = req.body as { expectedVersion: number }
    if (current.state === 'closed') fail('INVALID_STATE')
    s.c.checkVersion(current.version, input.expectedVersion)
    return { data: view(write(s, current, { state: 'closed', origin: 'owner', active: false })) }
  }
  if (name === 'resumeAssistantTopic') {
    const current = row(s, req.params.id!), input = req.body as { expectedVersion: number }
    if (current.state !== 'paused') fail('INVALID_STATE')
    s.c.checkVersion(current.version, input.expectedVersion)
    pauseActiveTopic(s, current.assistant_id, { owner: true }, 'owner')
    return { data: view(write(s, current, { state: 'active', origin: 'owner' })) }
  }
  if (name === 'assistantTopicHistory') {
    const topic = view(row(s, req.params.id!))
    const revisions = s.db.prepare('SELECT document FROM assistant_topic_revisions WHERE topic_id=? ORDER BY version DESC LIMIT 100').all(topic.id).reverse().flatMap(entry => {
      const parsed = AssistantTopic.safeParse(JSON.parse(String(entry.document)))
      return parsed.success ? [{ ...parsed.data, allowedActions: [] }] : []
    })
    return { data: AssistantTopicHistory.parse({ topic, revisions }) }
  }
  fail('NOT_IMPLEMENTED')
}

export function assistantTopicReplay(s: ChatService, name: string, previous: unknown): unknown {
  const value = previous as { data?: { id?: string } }
  if (!value.data?.id) return previous
  if (name === 'assistantTopicHistory') return handleAssistantTopic(s, name, { params: { id: value.data.id } } as ChatRequest)
  return { data: view(row(s, value.data.id)) }
}
