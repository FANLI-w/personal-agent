import { randomUUID } from 'node:crypto'
import {
  LibraryIndexEntry,
  type RequestFor,
  type libraryIndexRoutes,
} from '@research-agent-platform/contracts'
import type { ChatService } from './chat.js'
import { isLabManager } from './invite-management.js'
import { fail } from './errors.js'
import { hash } from './auth.js'

type Command = keyof typeof libraryIndexRoutes

/**
 * The lab's files stay where they are; this table only remembers which file,
 * where it lives relative to the shared folder, what it is for and who keeps it
 * current. Nothing here is a copy of the file or of its text.
 */
export function runLibraryIndex(
  s: ChatService,
  name: Command,
  req: RequestFor<Command>,
) {
  const c = s.c,
    actor = c.actor.id,
    lab = c.labId,
    manager = isLabManager(s.db, c.actor)
  const parse = (document: unknown) =>
    LibraryIndexEntry.parse(JSON.parse(String(document)))
  const project = (entry: LibraryIndexEntry): LibraryIndexEntry => ({
    ...entry,
    allowedActions:
      entry.status === 'revoked'
        ? []
        : entry.maintainerId === actor || manager
          ? ['revise', 'revoke']
          : [],
  })
  if (name === 'libraryIndex') {
    const entries = s.db
      .prepare(
        "SELECT document FROM library_index_entries WHERE lab_id=? AND status='active' ORDER BY project, updated_at DESC",
      )
      .all(lab)
      .map((row) => parse((row as { document: unknown }).document))
    return { data: { entries: entries.map(project) } }
  }
  const b = (req as RequestFor<'saveLibraryIndexEntry'>).body
  // Defaults live in the schema; the request type keeps them optional.
  const input = {
    project: b.project,
    name: b.name,
    relPath: b.relPath,
    purpose: b.purpose,
    summary: b.summary ?? '',
    sha256: b.sha256 ?? null,
    recommended: b.recommended ?? false,
  }
  // Authorize before replay: leaving the lab must not reveal a saved response.
  const commandKey = req.headers['Idempotency-Key']!,
    digest = hash(JSON.stringify(b)),
    resource = 'library-index'
  const cached = s.db
    .prepare(
      'SELECT request_hash,response_json FROM idempotency_results WHERE actor_id=? AND command=? AND resource_id=? AND key=?',
    )
    .get(actor, name, resource, commandKey)
  if (cached) {
    if (cached.request_hash !== digest) fail('IDEMPOTENCY_CONFLICT')
    const response = JSON.parse(String(cached.response_json))
    const row = s.db
      .prepare('SELECT document FROM library_index_entries WHERE id=? AND lab_id=?')
      .get(response.data.id, lab)
    if (!row) fail('NOT_FOUND')
    return response
  }
  const old = b.recordId
    ? (() => {
        const row = s.db
          .prepare(
            'SELECT document FROM library_index_entries WHERE id=? AND lab_id=?',
          )
          .get(b.recordId, lab)
        if (!row) fail('NOT_FOUND')
        return project(parse((row as { document: unknown }).document))
      })()
    : null
  if (old) {
    c.checkVersion(old.version, b.expectedVersion)
    if (old.status === 'revoked') fail('INVALID_STATE')
    if (!old.allowedActions.includes(b.action === 'save' ? 'revise' : 'revoke'))
      fail('FORBIDDEN')
  } else if (b.expectedVersion !== 0 || b.action !== 'save') fail('VALIDATION_ERROR')
  if (old && old.version >= 200) fail('RATE_LIMITED')
  if (!old) {
    const count = Number(
      s.db
        .prepare(
          "SELECT count(*) n FROM library_index_entries WHERE lab_id=? AND status='active'",
        )
        .get(lab)!.n,
    )
    if (count >= 500) fail('RATE_LIMITED')
  }
  // One pointer per file per project: the same path cannot mean two things.
  const clash = s.db
    .prepare(
      'SELECT id FROM library_index_entries WHERE lab_id=? AND project=? AND rel_path=? AND id!=?',
    )
    .get(lab, b.project, b.relPath, b.recordId ?? '')
  if (clash) fail('ALREADY_CLAIMED')
  const now = new Date().toISOString()
  // "Recommended" is unique per project and purpose, so nobody has to guess.
  if (b.action === 'save' && b.recommended) {
    const siblings = s.db
      .prepare(
        "SELECT id,document FROM library_index_entries WHERE lab_id=? AND project=? AND status='active'",
      )
      .all(lab, b.project)
    for (const row of siblings as { id: string; document: unknown }[]) {
      const entry = parse(row.document)
      if (entry.id === (old?.id ?? '') || !entry.recommended) continue
      if (entry.purpose !== b.purpose) continue
      const cleared = {
        ...entry,
        recommended: false,
        version: entry.version + 1,
        updatedAt: now,
      }
      s.db
        .prepare(
          'UPDATE library_index_entries SET version=?, updated_at=?, document=? WHERE id=?',
        )
        .run(cleared.version, cleared.updatedAt, JSON.stringify(cleared), entry.id)
    }
  }
  const value: LibraryIndexEntry = {
    project: input.project,
    name: input.name,
    relPath: input.relPath,
    purpose: input.purpose,
    summary: input.summary,
    sha256: input.sha256,
    recommended: input.recommended,
    // A revoke keeps the pointer as it was; only the status changes.
    ...(old && b.action === 'revoke'
      ? {
          project: old.project,
          name: old.name,
          relPath: old.relPath,
          purpose: old.purpose,
          summary: old.summary,
          sha256: old.sha256,
          recommended: old.recommended,
        }
      : {}),
    id: old?.id ?? randomUUID(),
    labId: lab,
    maintainerId: old?.maintainerId ?? actor,
    maintainerName: old?.maintainerName ?? c.member(actor).displayName,
    status: b.action === 'revoke' ? 'revoked' : 'active',
    version: (old?.version ?? 0) + 1,
    createdAt: old?.createdAt ?? now,
    updatedAt: now,
    allowedActions: [],
  }
  const document = JSON.stringify(value)
  s.db
    .prepare(
      `INSERT INTO library_index_entries(id,lab_id,project,rel_path,status,version,updated_at,document)
       VALUES(?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET project=excluded.project,rel_path=excluded.rel_path,status=excluded.status,version=excluded.version,updated_at=excluded.updated_at,document=excluded.document`,
    )
    .run(
      value.id,
      lab,
      value.project,
      value.relPath,
      value.status,
      value.version,
      value.updatedAt,
      document,
    )
  const result = { data: project(value) }
  s.db
    .prepare(
      'INSERT INTO idempotency_results(actor_id,command,resource_id,key,request_hash,response_json,http_status,created_at) VALUES(?,?,?,?,?,?,?,?)',
    )
    .run(
      actor,
      name,
      resource,
      commandKey,
      digest,
      JSON.stringify(result),
      200,
      now,
    )
  return result
}
