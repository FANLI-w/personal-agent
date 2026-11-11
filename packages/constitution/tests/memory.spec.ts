import { describe, expect, it } from 'vitest'
import { lifecycles, lifecycleReceipt, lifecycleSource } from '../src/index.js'

describe('记忆生命周期标注', () => {
  it('四类固定，顺序稳定', () => {
    expect(lifecycles).toEqual(['preference', 'conclusion', 'handoff', 'turn'])
  })

  it('每类都有代码落点', () => {
    for (const lifecycle of lifecycles) expect(lifecycleSource[lifecycle].length).toBeGreaterThan(0)
  })

  it('回执把缺席的类别也写出来', () => {
    expect(lifecycleReceipt({ preference: 3 })).toBe('preference:3/conclusion:0/handoff:0/turn:0')
    expect(lifecycleReceipt({})).toBe('preference:0/conclusion:0/handoff:0/turn:0')
    expect(lifecycleReceipt({ preference: 2, conclusion: 1, handoff: 1, turn: 1 })).toBe(
      'preference:2/conclusion:1/handoff:1/turn:1',
    )
  })
})
