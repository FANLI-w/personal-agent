import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkRuleInput } from '@research-agent-platform/contracts'
import { activeRuleBytes, constitutionEntries, planningRulesContext } from '../src/constitution-context.js'
import { readConfig } from '../src/config.js'
import { migrate, openDatabase, seed } from '../src/database.js'

const cleanup: (() => unknown)[] = []
afterEach(() => {
  for (const fn of cleanup.splice(0).reverse()) fn()
})

type Database = ReturnType<typeof openDatabase>

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'link-records-'))
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
  const config = readConfig({
    NODE_ENV: 'test',
    DATABASE_PATH: join(dir, 'db.sqlite'),
    BLOB_ROOT: join(dir, 'blobs'),
    APP_ORIGIN: 'http://127.0.0.1:4503',
  })
  mkdirSync(config.blobRoot)
  const db = openDatabase(config.databasePath, true)
  cleanup.push(() => db.close())
  migrate(db)
  seed(db, 'test')
  return { db, labId: 'lab_synthetic' }
}

function insert(db: Database, labId: string, row: { id: string; kind: 'rule' | 'link'; status: string; title: string; content: string }) {
  db.prepare('INSERT INTO work_context_records VALUES (?,?,?,?,?)').run(
    row.id,
    labId,
    'lab',
    labId,
    JSON.stringify({
      scope: 'lab',
      kind: row.kind,
      title: row.title,
      content: row.content,
      id: row.id,
      scopeId: labId,
      sourceTaskId: null,
      authorId: 'member_A',
      authorName: 'Synthetic author',
      status: row.status,
      version: 1,
      updatedAt: '2026-11-06T00:00:00Z',
      allowedActions: [],
    }),
  )
}

describe('链路记录与规则装配的关系', () => {
  it('契约接受链路类型', () => {
    expect(
      WorkRuleInput.parse({ scope: 'lab', kind: 'link', title: '审稿意见逐条回复', content: '先归类，再逐条回应。' }).kind,
    ).toBe('link')
  })

  it('链路不进入规划上下文，也不计入规则预算', () => {
    const { db, labId } = setup()
    insert(db, labId, { id: 'rule_active', kind: 'rule', status: 'active', title: '交付须附证据', content: '提交成果时附数据来源。' })
    insert(db, labId, { id: 'link_active', kind: 'link', status: 'active', title: '逐条回复审稿', content: '先归类再逐条回应。' })
    const entries = constitutionEntries(db, labId)
    expect(entries.map(entry => entry.id)).toEqual(['platform-work-rule', 'rule_active'])
    const context = planningRulesContext(db, labId)
    expect(context.text).not.toContain('逐条回复审稿')
    const withLink = activeRuleBytes(db, labId)
    expect(withLink).toBeLessThan(activeRuleBytes(db, labId) + 1)
    expect(context.ruleIds).not.toContain('link_active')
  })
})
