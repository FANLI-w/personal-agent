import type { DatabaseSync } from 'node:sqlite'
import { PLATFORM_WORK_RULE, WorkRule } from '@research-agent-platform/contracts'
import { compose, type Entry } from '@research-agent-platform/constitution'

/**
 * 规则上下文：平台规则 + 生效的课题组/项目规则，装配成可注入 system 的一段文本。
 * 只读，不写表、不改状态；批次 2 只接规划链路。
 */
export type RulesContext = {
  readonly text: string
  readonly bytes: number
  readonly omitted: readonly string[]
  readonly ruleIds: readonly string[]
}

const header = '工作规则（按平台、课题组、项目顺序生效；个人偏好不能覆盖团队要求）：\n'

export function constitutionEntries(db: DatabaseSync, labId: string): Entry[] {
  const entries: Entry[] = [
    {
      id: 'platform-work-rule',
      version: PLATFORM_WORK_RULE.version,
      layer: 'system',
      kind: 'rule',
      title: '平台规则',
      content: PLATFORM_WORK_RULE.content,
    },
  ]
  const rows = db
    .prepare("SELECT document FROM work_context_records WHERE lab_id=? AND scope IN ('lab','project') ORDER BY id")
    .all(labId)
  for (const row of rows) {
    const rule = WorkRule.parse(JSON.parse(String(row.document)))
    if (rule.kind !== 'rule' || rule.status !== 'active') continue
    entries.push({
      id: rule.id,
      version: rule.version,
      layer: 'lab',
      kind: 'rule',
      title: rule.title,
      content: rule.content,
    })
  }
  return entries
}

/** 与装配侧同口径的字节估算：按条目 JSON 计算，而不是只算正文。 */
export function entryBytes(layer: 'system' | 'lab', title: string, version: string | number, content: string): number {
  return Buffer.byteLength(JSON.stringify({ id: 'measure', version, layer, kind: 'rule', title, content }), 'utf8')
}

/** 当前生效规则占用的字节总量，含平台规则。写入侧用它把预算挡在保存之前。 */
export function activeRuleBytes(db: DatabaseSync, labId: string, excludeId?: string): number {
  let total = entryBytes('system', '平台规则', PLATFORM_WORK_RULE.version, PLATFORM_WORK_RULE.content)
  for (const row of db.prepare("SELECT document FROM work_context_records WHERE lab_id=? AND scope IN ('lab','project')").all(labId)) {
    const rule = WorkRule.parse(JSON.parse(String(row.document)))
    if (rule.kind !== 'rule' || rule.status !== 'active' || rule.id === excludeId) continue
    total += entryBytes('lab', rule.title, rule.version, rule.content)
  }
  return total
}

function render(entries: readonly Entry[], omitted: readonly string[]): RulesContext {
  const text = entries.length
    ? header +
      entries
        .map(entry => `[${entry.layer === 'system' ? '平台' : '课题组'}·${entry.title} v${entry.version}] ${entry.content}`)
        .join('\n')
    : ''
  return {
    text,
    bytes: Buffer.byteLength(text, 'utf8'),
    omitted,
    ruleIds: entries.map(entry => entry.id),
  }
}

/**
 * 存量规则超出预算时降级为只装配平台规则：整轮规划照常进行，
 * 省略原因进入回执。写入侧的预算检查负责让这种降级不再发生。
 */
export function planningRulesContext(db: DatabaseSync, labId: string): RulesContext {
  const entries = constitutionEntries(db, labId)
  try {
    const composed = compose(entries)
    return render(composed.included, composed.omitted)
  } catch {
    const composed = compose(entries.filter(entry => entry.layer === 'system'))
    return render(composed.included, [...composed.omitted, '课题组规则超出上下文预算，本轮已省略'])
  }
}
