import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import { routes, type RouteName } from '@research-agent-platform/contracts'
import { readConfig } from '../src/config.js'
import { openDatabase, migrate, seed, transaction } from '../src/database.js'
import { provisionTestAccounts } from '../src/auth.js'
import { ChatService } from '../src/chat.js'
import { serviceFor, type ModelCall, type ModelResult } from '../src/execution-worker.js'
import { runPersonalModel } from '../src/personal-models.js'
import { queueTopicCuration } from '../src/topic-curator-queue.js'
import { TopicCuratorWorker } from '../src/topic-curator-worker.js'

const cleanup: (() => void)[] = []
afterEach(() => { for (const fn of cleanup.splice(0).reverse()) fn() })
const result = (value: unknown): ModelResult => ({ text: JSON.stringify(value), failure: null, inputTokens: 1, outputTokens: 1, elapsedMs: 1 })
async function fixture(enabled = true) {
  const root = mkdtempSync(join(tmpdir(), 'acceptcat-topic-curator-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const master = join(root, 'synthetic.key'); writeFileSync(master, randomBytes(32).toString('hex'), { mode: 0o600 })
  const config = readConfig({ NODE_ENV: 'test', DATABASE_PATH: join(root, 'db.sqlite'), BLOB_ROOT: join(root, 'blobs'), APP_ORIGIN: 'http://127.0.0.1:4173', B3_AI_ENABLED: '1', LAB_CREDENTIAL_KEY_FILE: master })
  mkdirSync(config.blobRoot)
  const db = openDatabase(config.databasePath, true); cleanup.push(() => db.close()); migrate(db); seed(db, 'test')
  await provisionTestAccounts(db, 'test', [{ memberId: 'member_A', username: 'synthetic-a', password: 'SyntheticPassword123!' }])
  const service = new ChatService(serviceFor(db, 'member_A', config).c, config)
  const call = (name: RouteName, body: unknown = null, id?: string) => transaction(db, () => service.run(name as never, routes[name].request.parse({ body, params: id ? { id } : {}, query: {}, headers: routes[name].method === 'GET' ? {} : { 'Idempotency-Key': randomUUID() } }) as never)) as { data: any }
  if (enabled) transaction(db, () => runPersonalModel(db, service.c.actor, 'createPersonalModel', { body: { name: 'Synthetic model', provider: 'deepseek', model: 'synthetic-model', enabled: true, apiKey: 'SYNTHETIC_API_KEY' }, params: {}, query: {}, headers: { 'Idempotency-Key': randomUUID() } } as never, config))
  const { agent, conversation } = call('personalConversation', {}).data
  const topic = call('createAssistantTopic', { assistantId: agent.id, title: '初始话题', summary: '初始摘要', body: { context: '原来的背景' } }).data
  const message = (text: string, origin: 'human' | 'model', turnId: string | null = null) => service.message(conversation.id, {
    senderContactId: origin === 'human' ? service.human().id : agent.id, origin, text, mentions: [], resources: [], actionIds: [], turnId,
  })
  const queue = () => {
    const turnId = `turn_${randomUUID()}`
    const input = message('上一轮合成问题', 'human', turnId)
    const output = message('上一轮合成回复', 'model')
    const document = JSON.stringify({ agentContactId: agent.id, inputMessageId: input.id, outputMessageId: output.id })
    db.prepare("INSERT INTO chat_turns(id,conversation_id,owner_id,root_id,status,fence,request_json,document) VALUES(?,?,?,?,'succeeded',0,'{}',?)").run(turnId, conversation.id, 'member_A', turnId, document)
    queueTopicCuration(db, 'member_A', agent.id, conversation.id, turnId)
    return turnId
  }
  const job = (turnId: string) => db.prepare('SELECT status,result_json,failure FROM assistant_topic_curator_jobs WHERE turn_id=?').get(turnId) as { status: string; result_json: string | null; failure: string | null }
  const current = () => db.prepare('SELECT version,title,summary,title_status,state FROM assistant_topics WHERE id=?').get(topic.id) as { version: number; title: string; summary: string; title_status: string; state: string }
  return { db, config, agent, conversation, topic, queue, job, current, call, message }
}

it('applies an update_topic patch and consumes one job', { timeout: 30000 }, async () => {
  const f = await fixture(), turnId = f.queue()
  f.message('后续问题不能写进上一轮话题', 'human')
  let prompt = ''
  const worker = new TopicCuratorWorker(f.db, f.config, Date.now, async input => {
    prompt = input.prompt
    expect(JSON.parse(input.prompt).currentTopic.id).toBe(f.topic.id)
    expect(JSON.parse(input.prompt).messages.map((message: { text: string }) => message.text)).toEqual(['上一轮合成问题', '上一轮合成回复'])
    return result({ action: 'update_topic', topicId: f.topic.id, baseVersion: 1, title: '新标题', summary: '新摘要', body: { next: ['下一步'], constraints: ['约束'] } })
  })
  expect(await worker.tick()).toBe(true)
  expect(f.job(turnId)).toMatchObject({ status: 'succeeded' })
  expect(JSON.parse(f.job(turnId).result_json!)).toMatchObject({ action: 'update_topic', version: 2 })
  expect(f.current()).toMatchObject({ version: 2, title: '新标题', summary: '新摘要', title_status: 'provisional' })
  expect(f.call('assistantTopic', null, f.topic.id).data.body.context).toBe('原来的背景')
  expect(prompt).toContain('上一轮合成回复')
})

it('keeps the topic chosen by the owner while curation is in flight', { timeout: 30000 }, async () => {
  const f = await fixture(), turnId = f.queue()
  const worker = new TopicCuratorWorker(f.db, f.config, Date.now, async () => {
    f.call('closeAssistantTopic', { expectedVersion: 1 }, f.topic.id)
    f.call('createAssistantTopic', { assistantId: f.agent.id, title: '我选择的话题', summary: '保留这次选择' })
    return result({ action: 'new_topic', title: '过期模型结果', summary: '不应覆盖手动选择' })
  })
  expect(await worker.tick()).toBe(true)
  expect(JSON.parse(f.job(turnId).result_json!)).toMatchObject({ action: 'stale' })
  expect(f.db.prepare("SELECT title FROM assistant_topics WHERE state='active'").get()?.title).toBe('我选择的话题')
})

it('drops a stale patch and keeps the newer topic', { timeout: 30000 }, async () => {
  const f = await fixture(), turnId = f.queue()
  const worker = new TopicCuratorWorker(f.db, f.config, Date.now, async () => result({ action: 'update_topic', topicId: f.topic.id, baseVersion: 0, summary: '过期摘要', body: { next: ['过期'] } }))
  expect(await worker.tick()).toBe(true)
  expect(f.job(turnId)).toMatchObject({ status: 'succeeded' })
  expect(JSON.parse(f.job(turnId).result_json!)).toMatchObject({ action: 'stale' })
  expect(f.current()).toMatchObject({ version: 1, summary: '初始摘要' })
})

it('fails invalid model output and unavailable models without touching the topic', { timeout: 30000 }, async () => {
  const f = await fixture(), turnId = f.queue()
  expect(await new TopicCuratorWorker(f.db, f.config, Date.now, async () => ({ text: 'not json', failure: null, inputTokens: 1, outputTokens: 1, elapsedMs: 1 })).tick()).toBe(true)
  expect(f.job(turnId).failure).toBe('INVALID_MODEL_OUTPUT')
  expect(f.current()).toMatchObject({ version: 1, summary: '初始摘要' })
  const g = await fixture(false), otherTurn = g.queue()
  expect(await new TopicCuratorWorker(g.db, g.config).tick()).toBe(true)
  expect(g.job(otherTurn).failure).toBe('MODEL_UNAVAILABLE')
})
