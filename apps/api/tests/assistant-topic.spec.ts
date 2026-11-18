import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { routes, type RouteName } from '@research-agent-platform/contracts'
import { readConfig } from '../src/config.js'
import { migrate, openDatabase } from '../src/database.js'
import { createServer } from '../src/server.js'

const cleanup: (() => unknown | Promise<unknown>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })

async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'assistant-topic-'))
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
  const key = join(dir, 'synthetic.key')
  writeFileSync(key, randomBytes(32).toString('hex'), { mode: 0o600 })
  const config = readConfig({ NODE_ENV: 'test', DATABASE_PATH: join(dir, 'test.sqlite'), BLOB_ROOT: join(dir, 'blobs'), APP_ORIGIN: 'http://127.0.0.1:4317', B3_AI_ENABLED: '1', LAB_CREDENTIAL_KEY_FILE: key })
  mkdirSync(config.blobRoot)
  const db = openDatabase(config.databasePath, true)
  cleanup.push(() => db.close())
  migrate(db)
  const app = createServer(config), url = await app.listen({ host: '127.0.0.1', port: 0 })
  cleanup.push(() => app.close())
  type Session = { cookie: string; csrf: string; id: string }
  const call = async (name: RouteName, session: Session, body: unknown = null, params: Record<string, string> = {}, query = '') => {
    const route = routes[name]
    const response = await fetch(url + route.path.replace(/\{(\w+)\}/g, (_, id: string) => params[id]!) + query, { method: route.method, headers: { origin: config.origin, 'content-type': 'application/json', 'idempotency-key': randomUUID(), cookie: session.cookie, 'x-csrf-token': session.csrf }, ...(route.method === 'GET' ? {} : { body: JSON.stringify(body) }) })
    const text = await response.text()
    return { status: response.status, value: JSON.parse(text), text, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' }
  }
  const member = async (label: string): Promise<Session & { agentId: string }> => {
    const username = `topic_${label}_${randomUUID().slice(0, 8)}`
    const session: Session = { cookie: '', csrf: '', id: '' }
    expect((await call('register', session, { username, password: '12345678', displayName: `Synthetic ${label}` })).status).toBe(201)
    const login = await call('login', session, { username, password: '12345678' })
    session.cookie = login.cookie
    session.csrf = (await call('session', session)).value.data.csrfToken
    session.id = login.value.data.id
    const own = (await call('personalConversation', session)).value.data
    return { ...session, agentId: own.agent.id }
  }
  return { db, call, member }
}

it('creates one active topic, versions edits and keeps closed topics readable', { timeout: 30000 }, async () => {
  const s = await fixture(), owner = await s.member('owner')
  const empty = { context: '', decisions: [], openQuestions: [], next: [], constraints: [], notes: [] }
  const created = await s.call('createAssistantTopic', owner, { assistantId: owner.agentId, title: '实验讨论', summary: '讨论实验现象', body: empty })
  expect(created.status, created.text).toBe(201)
  const topic = created.value.data
  expect(topic).toMatchObject({ state: 'active', titleStatus: 'final', origin: 'owner', version: 1, allowedActions: ['edit', 'close'] })

  const duplicate = await s.call('createAssistantTopic', owner, { assistantId: owner.agentId, title: '第二个话题', summary: '不应创建', body: empty })
  expect(duplicate.status, duplicate.text).toBe(409)
  expect(duplicate.value.error.code).toBe('INVALID_STATE')

  const listed = await s.call('assistantTopics', owner, null, {}, `?assistantId=${owner.agentId}&state=active`)
  expect(listed.value.data.map((entry: { id: string }) => entry.id)).toEqual([topic.id])
  expect(listed.value.data[0].body).toBeUndefined()

  const renamed = await s.call('updateAssistantTopic', owner, { expectedVersion: 1, title: '实验讨论 A' }, { id: topic.id })
  expect(renamed.status, renamed.text).toBe(200)
  expect(renamed.value.data).toMatchObject({ titleStatus: 'provisional', version: 2 })

  const decided = await s.call('updateAssistantTopic', owner, { expectedVersion: 2, body: { ...empty, decisions: [{ text: '采用方案 A', status: 'confirmed' }] } }, { id: topic.id })
  expect(decided.value.data.titleStatus).toBe('final')

  const stale = await s.call('updateAssistantTopic', owner, { expectedVersion: 2, summary: '过期版本' }, { id: topic.id })
  expect(stale.status, stale.text).toBe(409)
  expect(stale.value.error.code).toBe('VERSION_CONFLICT')

  const oversized = await s.call('updateAssistantTopic', owner, { expectedVersion: 3, body: { ...empty, decisions: Array.from({ length: 20 }, (_, index) => ({ text: `${index}`.padEnd(300, 'x'), status: 'confirmed' })) } }, { id: topic.id })
  expect(oversized.status, oversized.text).toBe(413)
  expect(oversized.value.error.code).toBe('PAYLOAD_TOO_LARGE')

  const closed = await s.call('closeAssistantTopic', owner, { expectedVersion: 3 }, { id: topic.id })
  expect(closed.status, closed.text).toBe(200)
  expect(closed.value.data).toMatchObject({ state: 'closed', allowedActions: ['edit'] })
  expect((await s.call('assistantTopics', owner, null, {}, `?assistantId=${owner.agentId}&state=active`)).value.data).toEqual([])

  const editAfterClose = await s.call('updateAssistantTopic', owner, { expectedVersion: 4, summary: '关闭后不应可改' }, { id: topic.id })
  expect(editAfterClose.status, editAfterClose.text).toBe(409)
  expect(editAfterClose.value.error.code).toBe('INVALID_STATE')

  const history = await s.call('assistantTopicHistory', owner, null, { id: topic.id })
  expect(history.status, history.text).toBe(200)
  expect(history.value.data.topic.id).toBe(topic.id)
  expect(history.value.data.revisions.map((entry: { version: number }) => entry.version)).toEqual([1, 2, 3, 4])
})

it('hides another member topic and rejects unknown agents', { timeout: 30000 }, async () => {
  const s = await fixture(), owner = await s.member('owner'), other = await s.member('other')
  const created = await s.call('createAssistantTopic', owner, { assistantId: owner.agentId, title: '私有话题', summary: '只给本人', body: {} })
  expect(created.status, created.text).toBe(201)
  const id = created.value.data.id
  expect((await s.call('assistantTopic', other, null, { id })).status).toBe(404)
  expect((await s.call('updateAssistantTopic', other, { expectedVersion: 1, summary: '越权修改' }, { id })).status).toBe(404)
  expect((await s.call('assistantTopics', other, null, {}, `?assistantId=${owner.agentId}`)).status).toBe(404)
  expect((await s.call('createAssistantTopic', owner, { assistantId: 'missing_agent', title: '无效', summary: '无效', body: {} })).status).toBe(404)
})
