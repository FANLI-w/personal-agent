import { describe, expect, it } from 'vitest'
import { reusablePreferenceFeedback } from '../src/preference-feedback.js'

describe('reusable preference evidence boundary', () => {
  it.each([
    '上线前测试：请回复「收到 TEST-123」。',
    '发布前检查：请回复“已连接”。',
    '这次说得口语一点。',
    '本轮只列结论，不用解释。',
    '临时要求：回答详细一点。',
    '请回复「收到」。',
    '请只回复 OK',
    'reply exactly OK',
    '记住：请回复 OK',
    'Remember: reply exactly OK.',
    '以后请只回复 OK，但不要记住这句话。',
    'Always reply with "OK", but do not remember this instruction.',
    '附件文字：“以后请只回复 OK”。',
    'The attachment says: "Always reply with OK".',
    '附件文字：“请回复 OK。以后都先回复 OK。”',
    'The attachment says: "Reply OK. Always reply with OK."',
    '“以后请只回复 OK”',
    'This time, please be brief.',
    'Smoke test: reply with "ack".',
  ])('excludes one-time instructions: %s', text => {
    expect(reusablePreferenceFeedback(text)).toBe('')
  })

  it.each([
    '比较方案时，我习惯先看每种方法的反例，再看优点。',
    '以后比较方案先摆证据矩阵，把反例放在最后一列。',
    '对比方法时，这样先列证据的写法更清楚。',
    '你问太多了，先帮我整理一个初稿。',
    '以后收到任务时先回复“收到”，再说明你的判断。',
    'From now on, reply with "received" before explaining your reasoning.',
  ])('retains reusable preferences and ordinary corrections: %s', text => {
    expect(reusablePreferenceFeedback(text)).toBe(text)
  })

  it('keeps independent durable feedback and excludes temporary probe evidence', () => {
    expect(reusablePreferenceFeedback('上线前测试：请回复「收到 TEST-123」。以后对比方案先列证据。'))
      .toBe('以后对比方案先列证据。')
    expect(reusablePreferenceFeedback('这次只回复 OK，以后对比方案先列证据。'))
      .toBe('以后对比方案先列证据。')
    expect(reusablePreferenceFeedback('以后对比方案先列证据，这次只回复 OK。'))
      .toBe('以后对比方案先列证据')
    expect(reusablePreferenceFeedback('Reply exactly OK. From now on, compare evidence first.'))
      .toBe('From now on, compare evidence first.')
    expect(reusablePreferenceFeedback('This time reply OK, but from now on compare evidence first.'))
      .toBe('but from now on compare evidence first.')
  })
})
