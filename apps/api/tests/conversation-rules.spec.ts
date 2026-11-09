import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { conversationRulesContext } from '../src/constitution-context.js'
import { readConfig } from '../src/config.js'
import { migrate, openDatabase, seed } from '../src/database.js'

const cleanup: (() => unknown)[] = []
afterEach(() => {
  for (const fn of cleanup.splice(0).reverse()) fn()
})

type Database = ReturnType<typeof openDatabase>

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'conversation-rules-'))
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
  const config = readConfig({
    NODE_ENV: 'test',
    DATABASE_PATH: join(dir, 'db.sqlite'),
    BLOB_ROOT: join(dir, 'blobs'),
    APP_ORIGIN: 'http://127.0.0.1:4502',
  })
  mkdirSync(config.blobRoot)
  const db = openDatabase(config.databasePath, true)
  cleanup.push(() => db.close())
  migrate(db)
  seed(db, 'test')
  return { db, labId: 'lab_synthetic' }
}

function insertRule(db: Database, labId: string, id: string, title: string, content: string) {
  db.prepare('INSERT INTO work_context_records VALUES (?,?,?,?,?)').run(
    id,
    labId,
    'lab',
    labId,
    JSON.stringify({
      scope: 'lab',
      kind: 'rule',
      title,
      content,
      id,
      scopeId: labId,
      sourceTaskId: null,
      authorId: 'member_A',
      authorName: 'Synthetic author',
      status: 'active',
      version: 1,
      updatedAt: '2026-11-06T00:00:00Z',
      allowedActions: [],
    }),
  )
}

describe('会话的规则作用域', () => {
  it('群聊取群所属课题组的规则', () => {
    const { db, labId } = setup()
    insertRule(db, labId, 'rule_group', '交付须附证据', '提交成果时附数据来源与复现命令。')
    const context = conversationRulesContext(db, { id: 'conversation_group', kind: 'group', labId })
    expect(context.ruleScope).toBe('lab')
    expect(context.ruleIds).toEqual(['platform-work-rule', 'rule_group'])
    expect(context.text).toContain('交付须附证据')
  })

  it('私聊与个人会话只带平台规则', () => {
    const { db, labId } = setup()
    insertRule(db, labId, 'rule_group', '交付须附证据', '提交成果时附数据来源与复现命令。')
    for (const kind of ['direct', 'personal'] as const) {
      const context = conversationRulesContext(db, { id: `conversation_${kind}`, kind, labId })
      expect(context.ruleScope).toBe('platform')
      expect(context.ruleIds).toEqual(['platform-work-rule'])
      expect(context.text).not.toContain('交付须附证据')
    }
  })

  it('平台层标题不再声称包含课题组层', () => {
    const { db, labId } = setup()
    const context = conversationRulesContext(db, { id: 'conversation_direct', kind: 'direct', labId })
    expect(context.text.startsWith('工作规则（平台层；')).toBe(true)
  })
})
