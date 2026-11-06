import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Plan, routes, type RouteName } from '@research-agent-platform/contracts'
import { openDatabase, migrate, seed } from '../src/database.js'
import { provisionTestAccounts } from '../src/auth.js'
import { readConfig } from '../src/config.js'
import { createServer } from '../src/server.js'
import { ExecutionWorker } from '../src/execution-worker.js'
import { planningProjection } from '../src/planning-compat.js'

const cleanup: (() => unknown | Promise<unknown>)[] = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })
// These two fields are the only Plan additions in 0.43. Keep the legacy reader
// strict instead of hiding a wire regression with permissive parsing.
const LegacyPlan = Plan.omit({ outcome: true, supplements: true })
const schedule = { suggested: null, hardDeadline: null, committed: null, checkpoint: null, estimatedHumanHours: null }
const item = (id = 'first') => ({ id, title: 'Synthetic step', goal: 'Synthetic goal', deliverable: 'Synthetic report', acceptanceCriteria: 'Traceable synthetic evidence', allocation: { kind: 'self' as const }, dependencies: [], schedule, inputArtifactIds: [], budget: null, status: '可执行' as const })
const input = () => ({ labId: 'lab_synthetic', goal: 'Synthetic common goal', outcome: 'Synthetic final report', proposedItems: [item(), item('closing')], supplements: [{ id: 's1', nodeId: 'first', kind: 'constraint' as const, text: 'Keep raw synthetic evidence' }], unresolvedQuestions: [] })

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'planner-compat-'))
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
  const master = join(dir, 'test.key'); writeFileSync(master, randomBytes(32).toString('hex'))
  const config = readConfig({ NODE_ENV: 'test', DATABASE_PATH: join(dir, 'db'), BLOB_ROOT: join(dir, 'blobs'), APP_ORIGIN: 'http://127.0.0.1:4173', B3_AI_ENABLED: '1', LAB_CREDENTIAL_KEY_FILE: master })
  mkdirSync(config.blobRoot)
  const db = openDatabase(config.databasePath, true); cleanup.push(() => db.close()); migrate(db); seed(db, 'test')
  const accounts = ['A', 'B'].map(letter => ({ memberId: `member_${letter}`, username: `planner_compat_${letter}`, password: randomBytes(24).toString('hex') }))
  await provisionTestAccounts(db, 'test', accounts)
  const app = createServer(config); cleanup.push(() => app.close())
  const people: { cookie: string; csrf: string }[] = []
  for (const account of accounts) {
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: config.origin }, payload: { username: account.username, password: account.password } })
    expect(login.statusCode, login.body).toBe(200)
    const cookie = String(login.headers['set-cookie']).split(';')[0]!
    const session = await app.inject({ url: '/api/v1/auth/session', headers: { cookie } })
    people.push({ cookie, csrf: session.json().data.csrfToken })
  }
  const call = async (name: RouteName, body?: unknown, id = '', modern: boolean | string = true, key = randomUUID(), actor = 0) => {
    const route = routes[name], person = people[actor]
    return app.inject({ method: route.method, url: route.path.replace('{id}', id), headers: {
      origin: config.origin, ...(person ? { cookie: person.cookie, 'x-csrf-token': person.csrf } : {}), 'idempotency-key': key,
      ...(modern ? { 'x-acceptcat-planning': modern === true ? 'extensions-v1' : modern } : {}),
    }, ...(route.method === 'GET' ? {} : { payload: body as any }) })
  }
  const ok = async (...args: Parameters<typeof call>) => {
    const response = await call(...args); expect(response.statusCode, response.body).toBeLessThan(300); return response.json().data
  }
  return { db, config, call, ok }
}

describe('planner extensions coexistence with strict old clients', { timeout: 30000 }, () => {
  it('projects reads, confirmations and idempotent replays without changing stored plans or access', async () => {
    const s = await setup(), body = input(), key = randomUUID()
    const created = await s.ok('createPlan', body, '', true, key)
    expect(created.outcome).toBe(body.outcome)
    const replay = await s.ok('createPlan', body, '', false, key)
    expect(LegacyPlan.safeParse(replay).success).toBe(true)
    for (const modern of [false, 'unknown-version']) {
      const legacy = await s.call('getPlan', undefined, created.id, modern)
      expect(legacy.headers['cache-control']).toBe('no-store')
      expect(legacy.headers['x-contract-version']).toBe('0.43.0')
      expect(LegacyPlan.safeParse(legacy.json().data).success).toBe(true)
    }
    expect(await s.ok('getPlan', undefined, created.id)).toMatchObject(body)
    const stored = JSON.parse(String(s.db.prepare('SELECT document FROM plans WHERE id=?').get(created.id)!.document))
    expect(stored).toMatchObject(body)
    const receipt = JSON.parse(String(s.db.prepare("SELECT response_json FROM idempotency_results WHERE command='createPlan' AND key=?").get(key)!.response_json))
    expect(receipt.data).toMatchObject(body)
    for (const modern of [true, false]) {
      expect((await s.call('getPlan', undefined, created.id, modern, randomUUID(), 1)).statusCode).toBe(404)
      expect((await s.call('getPlan', undefined, created.id, modern, randomUUID(), 99)).statusCode).toBe(401)
    }
    const confirmKey = randomUUID()
    const confirmed = await s.ok('confirmPlan', { expectedVersion: 1 }, created.id, false, confirmKey)
    expect(LegacyPlan.safeParse(confirmed.plan).success).toBe(true)
    expect(confirmed.taskIds).toHaveLength(2)
    const modern = await s.ok('confirmPlan', { expectedVersion: 1 }, created.id, true, confirmKey)
    expect(modern.plan).toMatchObject(body)
    expect(modern.taskIds).toEqual(confirmed.taskIds)
  })

  it('preserves unseen extension fields on an old-client date edit and only prunes removed anchors', async () => {
    const s = await setup(), body = input(), created = await s.ok('createPlan', body)
    const { outcome: _outcome, supplements: _supplements, ...legacy } = body
    const key = randomUUID(), edited = { ...legacy, expectedVersion: 1, proposedItems: legacy.proposedItems.map(step => ({ ...step, schedule: { ...schedule, hardDeadline: { value: { kind: 'date', date: '2026-11-30', timezone: 'Asia/Shanghai' }, source: 'user', confirmed: true } } })) }
    const old = await s.ok('editPlan', edited, created.id, false, key)
    expect(LegacyPlan.safeParse(old).success).toBe(true)
    const current = await s.ok('editPlan', edited, created.id, true, key)
    expect(current).toMatchObject({ outcome: body.outcome, supplements: body.supplements, version: 2 })
    await s.ok('editPlan', { ...legacy, proposedItems: [item('closing')], expectedVersion: 2 }, created.id, false)
    expect(await s.ok('getPlan', undefined, created.id)).toMatchObject({ outcome: body.outcome, supplements: [], version: 3 })
  })

  it('returns real worker skeleton replies to both client versions and refuses to confirm unfinished work', async () => {
    const s = await setup()
    await s.ok('createPersonalModel', { name: 'Synthetic planning model', provider: 'qwen', model: 'synthetic-qwen', enabled: true, apiKey: 'synthetic-model-key' })
    const request = await s.ok('planRequest', { labId: 'lab_synthetic', replyMode: 'conversation', prompt: 'Synthetic missing prerequisite', inputArtifactIds: [], budget: { maxTokens: 100000, maxSeconds: 30 } })
    const body = input(), { goal: _goal, deliverable: _deliverable, acceptanceCriteria: _criteria, schedule: _schedule, inputArtifactIds: _inputs, ...rough } = item()
    await new ExecutionWorker(s.db, s.config, async () => ({ text: JSON.stringify({ answer: 'Synthetic prerequisite question.', plan: { ...body, proposedItems: [{ ...rough, status: '阻塞', missing: '缺依赖' }] } }), failure: null, inputTokens: 50, outputTokens: 50, elapsedMs: 10 })).tick()
    const modern = await s.ok('getPlanRequest', undefined, request.id)
    expect(modern.status).toBe('draft')
    expect(modern.reply.plan).toMatchObject({ outcome: body.outcome, supplements: body.supplements, proposedItems: [{ goal: '目标待确认', status: '阻塞' }] })
    const legacy = await s.ok('getPlanRequest', undefined, request.id, false)
    expect(LegacyPlan.safeParse(legacy.reply.plan).success).toBe(true)
    const denied = await s.call('confirmPlan', { expectedVersion: modern.reply.plan.version }, modern.reply.plan.id)
    expect(denied.statusCode).toBe(409)
    expect(denied.json().error.code).toBe('INVALID_STATE')
    expect(s.db.prepare('SELECT count(*) n FROM tasks WHERE plan_id=?').get(modern.planId)!.n).toBe(0)
  })

  it('also projects cancellation envelopes and leaves unrelated payloads and originals untouched', () => {
    const plan = { ...input(), id: 'plan', ownerId: 'member_A', status: 'draft', version: 1, createdAt: '2026-11-06T00:00:00Z' }
    const body = { data: { status: 'cancelled', reply: { message: 'Synthetic actual answer', plan } } }, original = structuredClone(body)
    expect((planningProjection('cancelPlanning', body, false) as typeof body).data.reply.plan).not.toHaveProperty('supplements')
    expect(body).toEqual(original)
    expect(planningProjection('cancelPlanning', body, true)).toBe(body)
    expect(planningProjection('task', body, false)).toBe(body)
  })
})
