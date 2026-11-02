import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { readConfig } from '../src/config.js'
import { migrate, openDatabase, seed } from '../src/database.js'
import { provisionTestAccounts } from '../src/auth.js'
import { createServer } from '../src/server.js'

const cleanup: (() => unknown | Promise<unknown>)[] = []
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f()
})

async function setup() {
  const root = mkdtempSync(join(tmpdir(), 'library-index-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const config = readConfig({
    NODE_ENV: 'test',
    DATABASE_PATH: join(root, 'db'),
    BLOB_ROOT: join(root, 'blobs'),
    APP_ORIGIN: 'http://127.0.0.1:4498',
  })
  mkdirSync(config.blobRoot)
  const db = openDatabase(config.databasePath, true)
  cleanup.push(() => db.close())
  migrate(db)
  seed(db, 'test')
  const password = randomBytes(24).toString('hex')
  await provisionTestAccounts(
    db,
    'test',
    ['A', 'B', 'C'].map((x) => ({
      memberId: `member_${x}`,
      username: `index_${x}`,
      password,
    })),
  )
  db.prepare('INSERT INTO lab_managers VALUES(?,?,?,NULL)').run(
    'lab_synthetic',
    'member_A',
    new Date().toISOString(),
  )
  const app = createServer(config)
  cleanup.push(() => app.close())
  const people: { cookie: string; csrf: string }[] = []
  for (const x of ['A', 'B', 'C']) {
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: config.origin },
      payload: { username: `index_${x}`, password },
    })
    expect(login.statusCode, login.body).toBe(200)
    const cookie = String(login.headers['set-cookie']).split(';')[0]!,
      session = (
        await app.inject({ url: '/api/v1/auth/session', headers: { cookie } })
      ).json().data
    people.push({ cookie, csrf: session.csrfToken })
  }
  const call = (path: string, body?: unknown, actor = 0, key = randomUUID()) =>
    app.inject({
      method: body === undefined ? 'GET' : 'POST',
      url: '/api/v1/' + path,
      headers: {
        origin: config.origin,
        cookie: people[actor]!.cookie,
        'x-csrf-token': people[actor]!.csrf,
        'idempotency-key': key,
      },
      ...(body === undefined ? {} : { payload: body as any }),
    })
  return { db, app, call }
}

const entry = {
  project: '2027 面上',
  name: '组会母版.pptx',
  relPath: '模板/组会母版.pptx',
  purpose: 'master',
  summary: '蓝色主色、16:9',
  sha256: null,
  recommended: true,
  recordId: null,
  expectedVersion: 0,
  action: 'save',
}

it('keeps pointers only, with the maintainer and the lab manager able to revise', async () => {
  const s = await setup()
  const created = await s.call('library/index', entry, 1)
  expect(created.statusCode, created.body).toBe(200)
  const record = created.json().data
  expect(record.status).toBe('active')
  expect(record.maintainerId).toBe('member_B')
  expect(record.allowedActions).toEqual(['revise', 'revoke'])
  const listed = await s.call('library/index', undefined, 2)
  expect(listed.statusCode, listed.body).toBe(200)
  expect(listed.json().data.entries.map((e: any) => e.id)).toContain(record.id)
  // Someone else can see it but not change it; the manager can.
  expect(listed.json().data.entries[0].allowedActions).toEqual([])
  const manager = await s.call(
    'library/index',
    { ...entry, recordId: record.id, expectedVersion: 1, summary: '改成蓝色主色' },
    0,
  )
  expect(manager.statusCode, manager.body).toBe(200)
  expect(manager.json().data.summary).toBe('改成蓝色主色')
  expect(manager.json().data.maintainerId).toBe('member_B')
})

it('refuses a second pointer for the same file in one project, and absolute or escaping paths', async () => {
  const s = await setup()
  expect((await s.call('library/index', entry, 0)).statusCode).toBe(200)
  expect((await s.call('library/index', { ...entry, name: '副本.pptx' }, 0)).statusCode).toBe(409)
  for (const relPath of ['/etc/passwd', 'C:/secret.pptx', '模板/../../x.pptx'])
    expect((await s.call('library/index', { ...entry, relPath }, 0)).statusCode).toBe(400)
})

it('marks one recommended file per project and purpose', async () => {
  const s = await setup()
  const first = (await s.call('library/index', entry, 0)).json().data
  const second = (
    await s.call(
      'library/index',
      { ...entry, name: '新母版.pptx', relPath: '模板/新母版.pptx' },
      0,
    )
  ).json().data
  const listed = (await s.call('library/index', undefined, 0)).json().data.entries
  const byId = (id: string) => listed.find((e: any) => e.id === id)
  expect(byId(first.id).recommended).toBe(false)
  expect(byId(second.id).recommended).toBe(true)
  // A different purpose keeps its own recommendation.
  const reference = (
    await s.call(
      'library/index',
      { ...entry, name: '参考页.pptx', relPath: '模板/参考页.pptx', purpose: 'reference' },
      0,
    )
  ).json().data
  expect(reference.recommended).toBe(true)
})

it('versions, revokes and replays idempotently', async () => {
  const s = await setup()
  const record = (await s.call('library/index', entry, 0)).json().data
  expect(
    (await s.call('library/index', { ...entry, recordId: record.id, expectedVersion: 0 }, 0))
      .statusCode,
  ).toBe(409)
  const key = randomUUID(),
    revoke = { ...entry, recordId: record.id, expectedVersion: 1, action: 'revoke' as const }
  const first = await s.call('library/index', revoke, 0, key),
    second = await s.call('library/index', revoke, 0, key)
  expect(first.statusCode, first.body).toBe(200)
  expect(second.json()).toEqual(first.json())
  expect(first.json().data.status).toBe('revoked')
  expect((await s.call('library/index', undefined, 0)).json().data.entries).toEqual([])
  expect(
    (await s.call('library/index', { ...entry, recordId: record.id, expectedVersion: 2 }, 0))
      .statusCode,
  ).toBe(409)
  expect((await s.app.inject({ url: '/api/v1/library/index' })).statusCode).toBe(401)
})
