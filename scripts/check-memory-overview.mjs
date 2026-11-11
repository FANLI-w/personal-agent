#!/usr/bin/env node
/**
 * 记忆总览预览：只读、只给指针，不给正文。
 *
 * 把三类记忆按生命周期聚合成一份视图，每条只列 id、所属对象、版本、状态与时间，
 * 正文仍由各自的接口或表去取。这是「一份总览文档 + 多张权威表」里那份文档的雏形。
 *
 * 用法：
 *   node scripts/check-memory-overview.mjs                       # 列出有记忆的成员
 *   node scripts/check-memory-overview.mjs --member <id>         # 打印该成员的总览
 *   node scripts/check-memory-overview.mjs --member <id> --json  # 机器可读输出
 *   node scripts/check-memory-overview.mjs --demo                # 用合成数据演示
 */
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const flag = name => argv.includes(`--${name}`)
const value = name => {
  const index = argv.indexOf(`--${name}`)
  return index >= 0 ? argv[index + 1] : undefined
}

const lifecycles = ['preference', 'conclusion', 'handoff', 'turn']
const lifecycleLabels = {
  preference: '偏好（长期，跟随本人）',
  conclusion: '结论（长期，绑定任务与交付物）',
  handoff: '交接（临时，绑定任务版本）',
  turn: '本次要求（单轮，不存储）',
}

function demoDatabase() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE personal_memories (id TEXT PRIMARY KEY, member_id TEXT NOT NULL, topic TEXT NOT NULL, scope TEXT NOT NULL, status TEXT NOT NULL, origin TEXT NOT NULL, content TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT;
    CREATE TABLE tasks (id TEXT PRIMARY KEY, lab_id TEXT NOT NULL) STRICT;
    CREATE TABLE conclusions (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, owner_id TEXT NOT NULL, head_version INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL) STRICT;
    CREATE TABLE task_handoffs (offer_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, from_member_id TEXT NOT NULL, status TEXT NOT NULL) STRICT;
  `)
  db.prepare('INSERT INTO personal_memories VALUES (?,?,?,?,?,?,?,?,?,?)').run('mem_1','member_a','称呼','general','confirmed','explicit','称呼我为老师',2,'2026-11-01T00:00:00Z','2026-11-09T00:00:00Z')
  db.prepare('INSERT INTO personal_memories VALUES (?,?,?,?,?,?,?,?,?,?)').run('mem_2','member_a','回复方式','general','candidate','feedback','先给结论再给证据',1,'2026-11-05T00:00:00Z','2026-11-05T00:00:00Z')
  db.prepare('INSERT INTO tasks VALUES (?,?)').run('task_1','lab_demo')
  db.prepare('INSERT INTO conclusions VALUES (?,?,?,?,?,?)').run('con_1','task_1','member_a',3,0,'2026-11-08T00:00:00Z')
  db.prepare('INSERT INTO task_handoffs VALUES (?,?,?,?)').run('asg_1','task_1','member_a','pending')
  return db
}

const dbPath = flag('demo') ? ':memory:' : resolve(root, value('db') ?? '.runtime/platform.sqlite')
const db = flag('demo') ? demoDatabase() : new DatabaseSync(dbPath, { readOnly: true })
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => String(row.name))
const need = ['personal_memories', 'conclusions', 'task_handoffs']
if (!flag('demo')) {
  const missing = need.filter(name => !tables.includes(name))
  if (missing.length) {
    console.error(`该库缺少这些表，无法生成记忆总览：${missing.join('、')}`)
    console.error('请先对该库执行迁移，或用 --db 指向已迁移的库；--demo 可查看合成数据。')
    process.exit(1)
  }
}

const member = value('member')
if (!member && !flag('demo')) {
  const rows = db
    .prepare('SELECT member_id, COUNT(*) n FROM personal_memories GROUP BY member_id ORDER BY member_id')
    .all()
  console.log(`数据库：${dbPath}`)
  console.log('有记忆的成员：')
  for (const row of rows) console.log(`  ${row.member_id}  ${row.n} 条`)
  console.log('\n加 --member <id> 查看该成员的记忆总览；加 --demo 用合成数据演示。')
  process.exit(0)
}

const target = member ?? 'member_a'
/** 指针字段：id、所属对象、版本、状态、时间。正文一律不取。 */
const pointers = {
  preference: db
    .prepare('SELECT id, topic, scope, status, origin, version, updated_at FROM personal_memories WHERE member_id=? ORDER BY topic, id')
    .all(target)
    .map(row => ({
      id: String(row.id),
      subject: String(row.topic),
      scope: String(row.scope),
      status: String(row.status),
      origin: String(row.origin),
      version: Number(row.version),
      updatedAt: String(row.updated_at),
    })),
  conclusion: db
    .prepare('SELECT id, task_id, head_version, revoked, created_at FROM conclusions WHERE owner_id=? ORDER BY created_at, id')
    .all(target)
    .map(row => ({
      id: String(row.id),
      subject: String(row.task_id),
      status: Number(row.revoked) === 1 ? 'revoked' : 'current',
      version: Number(row.head_version),
      updatedAt: String(row.created_at),
    })),
  handoff: db
    .prepare('SELECT offer_id, task_id, status FROM task_handoffs WHERE from_member_id=? ORDER BY task_id, offer_id')
    .all(target)
    .map(row => ({
      id: String(row.offer_id),
      subject: String(row.task_id),
      status: String(row.status),
    })),
  turn: [],
}

const counts = Object.fromEntries(lifecycles.map(name => [name, pointers[name].length]))

if (flag('json')) {
  console.log(JSON.stringify({ member: target, counts, pointers, note: '只给指针，正文由各自接口取；本次要求不存储。' }, null, 2))
} else {
  console.log(`数据库：${flag('demo') ? '（合成内存库）' : dbPath}`)
  console.log(`成员：${target}`)
  console.log(`合计 ${lifecycles.map(name => `${name}:${counts[name]}`).join('/')}`)
  for (const name of lifecycles) {
    console.log(`\n${lifecycleLabels[name]}`)
    if (name === 'turn') {
      console.log('  （不存储，只在当前轮）')
      continue
    }
    if (!pointers[name].length) {
      console.log('  （空）')
      continue
    }
    for (const pointer of pointers[name]) {
      const version = pointer.version === undefined ? '' : ` v${pointer.version}`
      const status = pointer.status ? ` ${pointer.status}` : ''
      console.log(`  ${pointer.id}  ${pointer.subject}${version}${status}`)
    }
  }
}
