import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { readConfig } from '../src/config.js'
import { migrate, openDatabase, seed } from '../src/database.js'
import { provisionTestAccounts } from '../src/auth.js'
import { createServer } from '../src/server.js'
import type { DshTransport } from '../src/local-dsh.js'

const cleanup: (() => unknown | Promise<unknown>)[] = []
afterEach(async () => { for (const f of cleanup.splice(0).reverse()) await f() })
async function setup(transport: DshTransport) {
  const root = mkdtempSync(join(tmpdir(), 'local-dsh-')); cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const master = join(root, 'key'); writeFileSync(master, randomBytes(32).toString('hex'))
  const config = readConfig({ NODE_ENV: 'test', DATABASE_PATH: join(root, 'db'), BLOB_ROOT: join(root, 'blobs'), APP_ORIGIN: 'http://127.0.0.1:4498', B3_AI_ENABLED: '1', LAB_CREDENTIAL_KEY_FILE: master })
  mkdirSync(config.blobRoot); const db = openDatabase(config.databasePath, true); cleanup.push(() => db.close()); migrate(db); seed(db, 'test')
  const password = randomBytes(24).toString('hex')
  await provisionTestAccounts(db, 'test', ['A','B'].map(x => ({ memberId: `member_${x}`, username: `synthetic_dsh_${x}`, password })))
  const app = createServer(config, { dshTransport: transport }), url = await app.listen({ host: '127.0.0.1', port: 0 }); cleanup.push(() => app.close())
  const people: { cookie: string; csrf: string }[] = []
  for (const letter of ['A','B']) {
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: config.origin }, payload: { username: `synthetic_dsh_${letter}`, password } })
    expect(login.statusCode, login.body).toBe(200)
    const cookie = String(login.headers['set-cookie']).split(';')[0]!
    const session = (await app.inject({ url: '/api/v1/auth/session', headers: { cookie } })).json().data
    people.push({ cookie, csrf: session.csrfToken })
  }
  const call = (path: string, body?: unknown, actor = 0, extra: Record<string,string> = {}) => app.inject({ method: body === undefined ? 'GET' : 'POST', url: '/api/v1/' + path,
    headers: { origin: config.origin, cookie: people[actor]!.cookie, 'x-csrf-token': people[actor]!.csrf, 'idempotency-key': randomUUID(), ...extra }, ...(body === undefined ? {} : { payload: body as any }) })
  const model = async (provider = 'qwen', name = 'synthetic-model') => {
    const created = await call('me/model-configurations', { name: 'Synthetic model', provider, model: name, enabled: true, apiKey: 'synthetic-provider-secret' }); expect(created.statusCode, created.body).toBe(201)
    return (await call('local-dsh/configuration')).json().data
  }
  const input = (meta: any) => ({ fingerprint: meta.fingerprint, protocol: meta.protocol, request: { model: meta.model, stream: true, max_tokens: 8192, messages: [{ role: 'user', content: 'Synthetic local tools request' }], tools: meta.protocol === 'anthropic-messages' ? [{ name: 'read_file', input_schema: { type: 'object' } }] : [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }] } })
  return { db, config, people, url, app, call, model, input }
}

it('relays tool-call SSE with owned credentials; rejects anonymous, CSRF, wrong model, endpoint injection and stale selection', async () => {
  const seen: { url: string; body: any; headers: Headers }[] = []
  const s = await setup(async (url, init) => {
    seen.push({ url: String(url), body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) })
    return new Response('data: {"choices":[{"delta":{"tool_calls":[{"id":"synthetic_call","function":{"name":"read_file","arguments":"{}"}}]}}]}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
  })
  const meta = await s.model(), input = s.input(meta)
  expect((await s.app.inject({ url: '/api/v1/local-dsh/configuration' })).statusCode).toBe(401)
  expect((await s.call('local-dsh/completion', input, 0, { 'x-csrf-token': '' })).statusCode).toBe(403)
  expect((await s.call('local-dsh/completion', input, 0, { origin: 'https://evil.example' })).statusCode).toBe(403)
  expect((await s.call('local-dsh/completion', input, 1)).statusCode).toBe(503)
  expect((await s.call('local-dsh/completion', { ...input, fingerprint: 'stale' })).statusCode).toBe(409)
  for (const patch of [{ model: 'unauthorized' }, { baseURL: 'http://127.0.0.1' }, { max_tokens: 8193 }, { max_completion_tokens: 8193 }, { store: true }, { tools: [{ type: 'web_search' }] }])
    expect((await s.call('local-dsh/completion', { ...input, request: { ...input.request, ...patch } })).statusCode).toBe(400)
  expect(seen).toHaveLength(0)
  const result = await s.call('local-dsh/completion', { ...input, request: { ...input.request, store: false } })
  expect(result.statusCode).toBe(200); expect(result.body).toContain('synthetic_call'); expect(result.body).not.toContain('synthetic-provider-secret')
  expect(seen[0]!.url).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions')
  expect(seen[0]!.headers.get('authorization')).toBe('Bearer synthetic-provider-secret'); expect(seen[0]!.headers.has('cookie')).toBe(false)
  expect(seen[0]!.body.tools).toEqual(input.request.tools)
  const settings = (await s.call('me/model-configurations')).json().data
  await s.call('me/model-configurations/default', { expectedVersion: settings.version, configurationId: null })
  expect((await s.call('local-dsh/completion', input)).statusCode).toBe(503)
})

it('uses Anthropic messages for DeepSeek, redacts provider errors, and applies the per-member rate limit', async () => {
  let count = 0
  const s = await setup(async (url, init) => {
    count++; expect(String(url)).toBe('https://api.deepseek.com/anthropic/v1/messages')
    expect(new Headers(init?.headers).get('x-api-key')).toBe('synthetic-provider-secret')
    return new Response('private vendor diagnostic and synthetic-provider-secret', { status: 400 })
  })
  const meta = await s.model('deepseek', 'deepseek-flash')
  for (let i = 0; i < 30; i++) {
    const r = await s.call('local-dsh/completion', s.input(meta)); expect(r.statusCode).toBe(502); expect(r.body).not.toContain('synthetic-provider-secret')
  }
  expect((await s.call('local-dsh/completion', s.input(meta))).statusCode).toBe(429); expect(count).toBe(30)
})

it('cancels an in-flight stream after logout instead of continuing on a revoked session', async () => {
  let cancelled = false
  const s = await setup(async (_url, init) => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"synthetic":"started"}\n\n'))
      init?.signal?.addEventListener('abort', () => { cancelled = true; controller.error(Error('revoked')) }, { once: true })
    },
  }), { headers: { 'content-type': 'text/event-stream' } }))
  const meta = await s.model(), person = s.people[0]!
  const response = await fetch(s.url + '/api/v1/local-dsh/completion', { method: 'POST', headers: { origin: s.config.origin, cookie: person.cookie, 'x-csrf-token': person.csrf, 'content-type': 'application/json' }, body: JSON.stringify(s.input(meta)) })
  const reader = response.body!.getReader(); expect((await reader.read()).done).toBe(false)
  await s.call('auth/logout', {})
  await expect(reader.read()).rejects.toThrow(); expect(cancelled).toBe(true)
}, 10000)
