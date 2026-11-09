import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { constitutionEntries, planningRulesContext } from '../src/constitution-context.js'
import { readConfig } from '../src/config.js'
import { migrate, openDatabase, seed } from '../src/database.js'

const cleanup: (() => unknown)[] = []
afterEach(() => {
  for (const fn of cleanup.splice(0).reverse()) fn()
})

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'planning-rules-'))
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
  const config = readConfig({
    NODE_ENV: 'test',
    DATABASE_PATH: join(dir, 'db.sqlite'),
    BLOB_ROOT: join(dir, 'blobs'),
    APP_ORIGIN: 'http://127.0.0.1:4501',
  })
  mkdirSync(config.blobRoot)
  const db = openDatabase(config.databasePath, true)
  cleanup.push(() => db.close())
  migrate(db)
  seed(db, 'test')
  return { db, labId: 'lab_synthetic' }
}

type Database = ReturnType<typeof openDatabase>
type Row = { id: string; kind?: 'rule' | 'memory'; status?: 'candidate' | 'active' | 'revoked'; title: string; content: string }

function insertRule(db: Database, labId: string, row: Row) {
  db.prepare('INSERT INTO work_context_records VALUES (?,?,?,?,?)').run(
    row.id,
    labId,
    'lab',
    labId,
    JSON.stringify({
      scope: 'lab',
      kind: row.kind ?? 'rule',
      title: row.title,
      content: row.content,
      id: row.id,
      scopeId: labId,
      sourceTaskId: null,
      authorId: 'member_A',
      authorName: 'Synthetic author',
      status: row.status ?? 'active',
      version: 2,
      updatedAt: '2026-11-06T00:00:00Z',
      allowedActions: [],
    }),
  )
}

describe('规划链路的规则上下文', () => {
  it('平台规则始终装配，并排在课题组规则之前', () => {
    const { db, labId } = setup()
    insertRule(db, labId, { id: 'rule_active', title: '交付须附证据', content: '提交成果时附数据来源与复现命令。' })
    const entries = constitutionEntries(db, labId)
    expect(entries.map(entry => [entry.layer, entry.kind, entry.title])).toEqual([
      ['system', 'rule', '平台规则'],
      ['lab', 'rule', '交付须附证据'],
    ])
    const context = planningRulesContext(db, labId)
    expect(context.text.indexOf('平台规则')).toBeLessThan(context.text.indexOf('交付须附证据'))
    expect(context.ruleIds).toEqual(['platform-work-rule', 'rule_active'])
    expect(context.bytes).toBe(Buffer.byteLength(context.text, 'utf8'))
  })

  it('只收生效的规则，候选规则与记忆类记录不进上下文', () => {
    const { db, labId } = setup()
    insertRule(db, labId, { id: 'rule_active', title: '生效规则', content: '生效内容。' })
    insertRule(db, labId, { id: 'rule_candidate', status: 'candidate', title: '候选规则', content: '候选内容。' })
    insertRule(db, labId, { id: 'memory_active', kind: 'memory', title: '项目背景', content: '记忆内容。' })
    const context = planningRulesContext(db, labId)
    expect(context.ruleIds).toEqual(['platform-work-rule', 'rule_active'])
    expect(context.text).toContain('生效内容。')
    expect(context.text).not.toContain('候选内容。')
    expect(context.text).not.toContain('记忆内容。')
  })

  it('没有课题组规则时只装配平台规则', () => {
    const { db, labId } = setup()
    const context = planningRulesContext(db, labId)
    expect(context.ruleIds).toEqual(['platform-work-rule'])
    expect(context.omitted).toEqual([])
  })

  it('存量规则超出预算时阻止模型执行，不丢弃生效规则', () => {
    const { db, labId } = setup()
    // 单条规则受契约限制为 2000 字符，超预算只能由多条累积触发。
    for (let index = 0; index < 7; index += 1)
      insertRule(db, labId, { id: `rule_long_${index}`, title: `长规则${index}`, content: 'x'.repeat(2_000) })
    expect(()=>planningRulesContext(db, labId)).toThrow('BUDGET_EXCEEDED')
  })

  it('注入开关：开发与生产默认开启，测试环境默认关闭，可用环境变量强制', () => {
    const base = {
      DATABASE_PATH: 'C:/synthetic/db.sqlite',
      BLOB_ROOT: 'C:/synthetic/blobs',
      APP_ORIGIN: 'http://127.0.0.1:4501',
    }
    expect(readConfig({ ...base, NODE_ENV: 'development' }).constitutionRules).toBe(true)
    expect(readConfig({ ...base, NODE_ENV: 'test' }).constitutionRules).toBe(false)
    expect(readConfig({ ...base, NODE_ENV: 'test', CONSTITUTION_RULES: '1' }).constitutionRules).toBe(true)
    expect(readConfig({ ...base, NODE_ENV: 'development', CONSTITUTION_RULES: '0' }).constitutionRules).toBe(false)
  })
  it('项目约定只跟随明确的项目；普通群聊和其他项目不读取它',()=>{
    const {db,labId}=setup()
    insertRule(db,labId,{id:'p1',title:'项目一私有约定',content:'PROJECT_ONE_ONLY'})
    insertRule(db,labId,{id:'p2',title:'项目二私有约定',content:'PROJECT_TWO_ONLY'})
    for(const [id,project] of [['p1','project_one'],['p2','project_two']])db.prepare("UPDATE work_context_records SET scope='project',scope_id=?,document=json_set(document,'$.scope','project','$.scopeId',?) WHERE id=?").run(project!,project!,id!)
    expect(planningRulesContext(db,labId).text).not.toContain('PROJECT_')
    const selected=planningRulesContext(db,labId,'project_one')
    expect(selected.text).toContain('PROJECT_ONE_ONLY');expect(selected.text).not.toContain('PROJECT_TWO_ONLY')
  })
})
