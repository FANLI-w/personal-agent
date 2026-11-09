import type { Kind, Layer } from './axis.js'

/** 待装配的一条上下文。layer 与 kind 决定它进入哪一段、受哪条预算约束。 */
export type Entry = {
  readonly id: string
  readonly version: string | number
  readonly layer: Layer
  readonly kind: Kind
  readonly title: string
  readonly content: string
}

/**
 * 装配段。mandatory 段超预算时整轮失败而非静默截断；
 * 非 mandatory 段超预算时记入 omitted，供回执说明省略了什么。
 */
export type Section = {
  readonly name: string
  readonly match: (entry: Entry) => boolean
  readonly limit: number
  readonly mandatory: boolean
}

/** 约束段的预算。写入侧与装配侧共用同一个数值，避免两处判断不一致。 */
export const ruleBudget = 12_000

export const defaultSections: readonly Section[] = [
  { name: '约束', match: entry => entry.kind === 'rule', limit: ruleBudget, mandatory: true },
  { name: '工作对象', match: entry => entry.kind === 'object', limit: 20_000, mandatory: true },
  { name: '事实', match: entry => entry.kind === 'memory', limit: 32_000, mandatory: false },
  { name: '方法', match: entry => entry.kind === 'link' || entry.kind === 'skill', limit: 32_000, mandatory: false },
  { name: '参考', match: entry => entry.kind === 'source', limit: 36_000, mandatory: false },
]

export type ComposeResult = {
  readonly included: readonly Entry[]
  readonly omitted: readonly string[]
  readonly bytes: number
  readonly greeting: boolean
}

const sizeOf = (entry: Entry) => new TextEncoder().encode(JSON.stringify(entry)).length

/**
 * 按段装配上下文。纯函数：不读时钟、环境或数据库，同样的输入必得同样的结果。
 * 纯问候不载入任何条目。
 */
export function compose(
  entries: readonly Entry[],
  options: { greeting?: boolean; sections?: readonly Section[] } = {},
): ComposeResult {
  if (options.greeting) return { included: [], omitted: ['问候：未载入任何条目'], bytes: 0, greeting: true }
  const sections = options.sections ?? defaultSections
  const included: Entry[] = []
  const omitted: string[] = []
  let total = 0
  for (const section of sections) {
    let bytes = 0
    for (const entry of entries.filter(section.match)) {
      const cost = sizeOf(entry)
      if (bytes + cost > section.limit) {
        if (section.mandatory) throw new Error(`${section.name}段超过上下文预算，请精简后再执行。`)
        omitted.push(entry.title)
        continue
      }
      bytes += cost
      total += cost
      included.push(entry)
    }
  }
  return { included, omitted, bytes: total, greeting: false }
}
