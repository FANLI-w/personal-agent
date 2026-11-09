import { describe, expect, it } from 'vitest'
import { compose, type Entry } from '../src/index.js'

const entry = (kind: Entry['kind'], title: string, length = 40): Entry => ({
  id: `id-${title}`,
  version: 1,
  layer: 'lab',
  kind,
  title,
  content: 'x'.repeat(length),
})

describe('上下文装配', () => {
  it('按段顺序装配，约束先于事实', () => {
    const result = compose([entry('memory', '记忆A'), entry('rule', '规则A')])
    expect(result.included.map(item => item.title)).toEqual(['规则A', '记忆A'])
    expect(result.omitted).toEqual([])
    expect(result.bytes).toBeGreaterThan(0)
  })

  it('非必进段超预算记入 omitted，不影响其它段', () => {
    const result = compose([entry('rule', '规则A'), entry('memory', '大记忆', 40_000)])
    expect(result.included.map(item => item.title)).toEqual(['规则A'])
    expect(result.omitted).toEqual(['大记忆'])
  })

  it('必进段超预算直接失败，不做静默截断', () => {
    expect(() => compose([entry('rule', '超长规则', 13_000)])).toThrow(/约束段超过上下文预算/)
  })

  it('纯问候不载入任何条目', () => {
    const result = compose([entry('rule', '规则A')], { greeting: true })
    expect(result.included).toEqual([])
    expect(result.greeting).toBe(true)
  })

  it('同样的输入得到同样的结果', () => {
    const input = [entry('rule', '规则A'), entry('memory', '记忆A')]
    expect(compose(input)).toEqual(compose(input))
  })
})
