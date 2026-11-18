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
  const agent = call('createPersonalAgent', { displayName: '合成助手', introduction: '读取合成资料', capabilityDescription: '整理合成笔记', personality: '简洁' }).data
  const conversation = call('personalConversation', {}).data.conversation
  const topic = call('createAssistantTopic', { assistantId: agent.id, title: '初始话题', summary: '初始摘要' }).data
  const queue = () => {
    const turnId = `turn_${randomUUID()}`
    db.prepare("INSERT INTO chat_turns(id,conversation_id,owner_id,root_id,status,fence,request_json,document) VALUES(?,?,?,?,'running',0,'{}','{}')").run(turnId, conversation.id, 'member_A', turnId)
    service.message(conversation.id, { senderContactId: agent.id, origin: 'model', text: '上一轮合成回复', mentions: [], resources: [], actionIds: [], turnId: null })
    queueTopicCuration(db, 'member_A', agent.id, conversation.id, turnId)
    return turnId
  }
  const job = (turnId: string) => db.prepare('SELECT status,result_json,failure FROM assistant_topic_curator_jobs WHERE turn_id=?').get(turnId) as { status: string; result_json: string | null; failure: string | null }
  const current = () => db.prepare('SELECT version,title,summary,title_status,state FROM assistant_topics WHERE id=?').get(topic.id) as { version: number; title: string; summary: string; title_status: string; state: string }
  return { db, config, agent, conversation, topic, queue, job, current }
}

it('applies an update_topic patch and consumes one job', { timeout: 30000 }, async () => {
  const f = await fixture(), turnId = f.queue()
  let prompt = ''
  const worker = new TopicCuratorWorker(f.db, f.config, Date.now, async input => {
    prompt = input.prompt
    expect(JSON.parse(input.prompt).currentTopic.id).toBe(f.topic.id)
    expect(JSON.parse(input.prompt).messages[0].text).toBe('上一轮合成回复')
    return result({ action: 'update_topic', topicId: f.topic.id, baseVersion: 1, title: '新标题', summary: '新摘要', body: { next: ['下一步'], constraints: ['约束'] } })
  })
  expect(await worker.tick()).toBe(true)
  expect(f.job(turnId)).toMatchObject({ status: 'succeeded' })
  expect(JSON.parse(f.job(turnId).result_json!)).toMatchObject({ action: 'update_topic', version: 2 })
  expect(f.current()).toMatchObject({ version: 2, title: '新标题', summary: '新摘要', title_status: 'provisional' })
  expect(prompt).toContain('上一轮合成回复')
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
