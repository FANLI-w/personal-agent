#!/usr/bin/env node
/**
 * 聊天规则预览：只生成、不接线。
 *
 * 显示某个会话会拿到哪套规则：群聊取群所属课题组，私聊与个人会话只带平台规则。
 * 只读数据库，不写任何表，也不接入任何请求链路。
 *
 * 用法：
 *   node scripts/check-chat-rules.mjs                        # 列出本地库中的会话
 *   node scripts/check-chat-rules.mjs --conversation <id>    # 打印该会话的规则
 *   node scripts/check-chat-rules.mjs --demo                 # 用合成数据对比群聊与私聊
 *   node scripts/check-chat-rules.mjs --json                 # 机器可读输出
 */
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const flag = name => argv.includes(`--${name}`)
const value = name => {
  const index = argv.indexOf(`--${name}`)
  return index >= 0 ? argv[index + 1] : undefined
}

async function load() {
  try {
    return await import(pathToFileURL(join(root, 'apps/api/dist/constitution-context.js')).href)
  } catch (error) {
    console.error('缺少已编译的产物，请先运行：')
    console.error('  corepack pnpm@11.21.0 --filter @research-agent-platform/constitution build')
    console.error('  corepack pnpm@11.21.0 --filter @research-agent-platform/api build')
    console.error(String(error?.message ?? error))
    process.exit(1)
  }
}

function demoDatabase() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE labs (id TEXT PRIMARY KEY, name TEXT NOT NULL) STRICT;
    CREATE TABLE chat_conversations (id TEXT PRIMARY KEY, lab_id TEXT NOT NULL, owner_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('personal','direct','group')), scope_key TEXT UNIQUE, document TEXT NOT NULL) STRICT;
    CREATE TABLE work_context_records (id TEXT PRIMARY KEY, lab_id TEXT NOT NULL, scope TEXT NOT NULL CHECK(scope IN ('lab','project')), scope_id TEXT NOT NULL, document TEXT NOT NULL) STRICT;
  `)
  db.prepare('INSERT INTO labs VALUES (?,?)').run('demo', '演示课题组')
  const conversation = (id, kind) =>
    db.prepare('INSERT INTO chat_conversations VALUES (?,?,?,?,?,?)').run(id, 'demo', 'member_a', kind, id, '{}')
  conversation('conv_group', 'group')
  conversation('conv_direct', 'direct')
  conversation('conv_personal', 'personal')
  db.prepare('INSERT INTO work_context_records VALUES (?,?,?,?,?)').run(
    'rule_active',
    'demo',
    'lab',
    'demo',
    JSON.stringify({ scope: 'lab', kind: 'rule', title: '交付须附证据', content: '提交成果时附数据来源与复现命令。', id: 'rule_active', scopeId: 'demo', sourceTaskId: null, authorId: 'member_a', authorName: '甲', status: 'active', version: 3, updatedAt: '2026-11-06T00:00:00Z', allowedActions: [] }),
  )
  return db
}

const { conversationRulesContext } = await load()
const dbPath = flag('demo') ? undefined : resolve(root, value('db') ?? '.runtime/platform.sqlite')
const db = flag('demo') ? demoDatabase() : new DatabaseSync(dbPath, { readOnly: true })
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name)

if (!flag('demo') && !tables.includes('chat_conversations')) {
  console.error(`该库没有 chat_conversations 表，无法预览会话规则：${dbPath}`)
  console.error('请先对该库执行迁移，或用 --db 指向已迁移的库；--demo 可查看合成数据。')
  process.exit(1)
}

const rows = db.prepare('SELECT id, kind, lab_id, owner_id FROM chat_conversations ORDER BY id').all()
const target = value('conversation')

if (!flag('demo') && !target) {
  console.log(`数据库：${dbPath}`)
  console.log('会话：')
  for (const row of rows) console.log(`  ${row.id}  ${row.kind}  课题组=${row.lab_id}`)
  console.log('\n加 --conversation <id> 查看该会话的规则；加 --demo 对比群聊与私聊。')
  process.exit(0)
}

if (!flag('demo') && !tables.includes('work_context_records')) {
  console.error(`该库没有 work_context_records 表（迁移 029 之前），无法装配课题组规则：${dbPath}`)
  console.error('请先对该库执行迁移，或用 --db 指向已迁移的库；--demo 可查看合成数据。')
  process.exit(1)
}

const selected = target ? rows.filter(row => row.id === target) : rows
if (!selected.length) {
  console.error(`找不到会话：${target}`)
  process.exit(1)
}

const report = selected.map(row => {
  const context = conversationRulesContext(db, { id: String(row.id), kind: row.kind, labId: String(row.lab_id) })
  return {
    conversationId: String(row.id),
    kind: String(row.kind),
    labId: String(row.lab_id),
    ruleScope: context.ruleScope,
    ruleIds: context.ruleIds,
    omitted: context.omitted,
    bytes: context.bytes,
    estimatedTokens: Math.ceil(context.bytes / 3),
    text: context.text,
  }
})

if (flag('json')) {
  console.log(JSON.stringify(report.length === 1 ? report[0] : report, null, 2))
} else {
  for (const item of report) {
    console.log(`\n会话：${item.conversationId}（${item.kind}，课题组=${item.labId}）`)
    console.log(`规则作用域：${item.ruleScope === 'lab' ? '群所属课题组 + 平台' : '仅平台（个人规则不进群）'}`)
    console.log(`装配条目：${item.ruleIds.join('、') || '（空）'}`)
    if (item.omitted.length) console.log(`省略：${item.omitted.join('、')}`)
    console.log(`合计 ${item.bytes} B，约 ${item.estimatedTokens} token`)
    console.log('将注入 system 的文本：')
    console.log(item.text || '（空）')
  }
}
