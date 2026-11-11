#!/usr/bin/env node
/**
 * 规划规则预览：只生成、不接线。
 *
 * 调用 `apps/api` 的装配实现，打印将注入规划 system 的工作规则、字节、省略项与最终文本。
 * 只读数据库，不写任何表，也不接入任何请求链路。
 *
 * 用法：
 *   node scripts/check-planning-rules.mjs              # 列出本地库中的课题组
 *   node scripts/check-planning-rules.mjs --lab mylab # 打印该课题组的装配结果
 *   node scripts/check-planning-rules.mjs --demo      # 用合成数据演示
 *   node scripts/check-planning-rules.mjs --json      # 机器可读输出
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
    CREATE TABLE work_context_records (id TEXT PRIMARY KEY, lab_id TEXT NOT NULL, scope TEXT NOT NULL CHECK(scope IN ('lab','project')), scope_id TEXT NOT NULL, document TEXT NOT NULL) STRICT;
  `)
  db.prepare('INSERT INTO labs VALUES (?,?)').run('demo', '演示课题组')
  const record = (id, scope, kind, status, title, content) =>
    db.prepare('INSERT INTO work_context_records VALUES (?,?,?,?,?)').run(
      id,
      'demo',
      scope,
      'demo',
      JSON.stringify({ scope, kind, title, content, id, scopeId: 'demo', sourceTaskId: null, authorId: 'member_a', authorName: '甲', status, version: 3, updatedAt: '2026-11-06T00:00:00Z', allowedActions: [] }),
    )
  record('rule_active', 'lab', 'rule', 'active', '交付须附证据', '提交成果时附数据来源与复现命令，缺证据的交付退回补交。')
  record('rule_candidate', 'lab', 'rule', 'candidate', '候选中的规则', '这条尚未确认，不应进入上下文。')
  record('memory_active', 'project', 'memory', 'active', '项目背景', '这批数据来自上一轮实验，尚未去重。')
  return db
}

/** 仅用于说明“为什么某条没进上下文”，判定本身由装配实现负责。 */
function skippedRows(db, labId, included) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name)
  if (!tables.includes('work_context_records')) return { available: false, skipped: [] }
  const skipped = []
  for (const row of db.prepare('SELECT id, document FROM work_context_records WHERE lab_id = ? ORDER BY id').all(labId)) {
    if (included.includes(row.id)) continue
    let rule
    try {
      rule = JSON.parse(String(row.document))
    } catch {
      skipped.push(`${row.id}：无法解析`)
      continue
    }
    skipped.push(`${rule.title ?? row.id}：内容类为 ${rule.kind}，状态为 ${rule.status}`)
  }
  return { available: true, skipped }
}

const { planningRulesContext, layerCounts } = await load()
const labId = value('lab')
const dbPath = flag('demo') ? undefined : resolve(root, value('db') ?? '.runtime/platform.sqlite')
const db = flag('demo') ? demoDatabase() : new DatabaseSync(dbPath, { readOnly: true })

if (!flag('demo') && !labId) {
  const labs = db.prepare('SELECT id, name FROM labs ORDER BY id').all()
  console.log(`数据库：${dbPath}`)
  console.log('课题组：')
  for (const lab of labs) console.log(`  ${lab.id}  ${lab.name}`)
  console.log('\n加 --lab <id> 查看该课题组的装配结果；加 --demo 用合成数据演示。')
  process.exit(0)
}

const target = labId ?? 'demo'
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name)
if (!flag('demo') && !tables.includes('work_context_records')) {
  console.error(`该库没有 work_context_records 表（迁移 029 之前），无法装配课题组规则：${dbPath}`)
  console.error('请先对该库执行迁移，或用 --db 指向已迁移的库；--demo 可查看合成数据。')
  process.exit(1)
}
const context = planningRulesContext(db, target)
const { available, skipped } = skippedRows(db, target, context.ruleIds)
const estimatedTokens = Math.ceil(context.bytes / 3)

if (flag('json')) {
  console.log(JSON.stringify({ labId: target, recordsAvailable: available, ruleIds: context.ruleIds, rules: context.rules, layers: layerCounts(context.rules), omitted: context.omitted, skipped, bytes: context.bytes, estimatedTokens, text: context.text }, null, 2))
} else {
  console.log(`数据库：${flag('demo') ? '（合成内存库）' : dbPath}`)
  console.log(`课题组：${target}`)
  if (!available) console.log('注意：该库没有 work_context_records 表（迁移 029 之前），只装配平台规则。')
  console.log(`\n装配条目：${context.ruleIds.join('、') || '（空）'}`)
  console.log(`层级分布：${layerCounts(context.rules)}`)
  for (const rule of context.rules) console.log(`  ${rule.layer.padEnd(8)} v${rule.version}  ${rule.title}（${rule.id}）`)
  if (context.omitted.length) console.log(`省略：${context.omitted.join('、')}`)
  if (skipped.length) console.log(`未纳入：${skipped.join('；')}`)
  console.log(`\n合计 ${context.bytes} B，约 ${estimatedTokens} token（按 3 字节/token 估算）`)
  console.log('\n将注入 system 的文本：')
  console.log(context.text || '（空）')
}
