import { describe, expect, it } from 'vitest'
import { asset, canAny, resolveSubjects } from '../src/index.js'

describe('主体解析', () => {
  it('单个身份解析成对应主体，组内身份带 member', () => {
    expect(resolveSubjects({ owner: true })).toEqual(['owner'])
    expect(resolveSubjects({ member: true })).toEqual(['member'])
    expect(resolveSubjects({ manager: true })).toEqual(['manager', 'member'])
    expect(resolveSubjects({ initiator: true })).toEqual(['dispatcher', 'member'])
    expect(resolveSubjects({ lead: true })).toEqual(['assignee', 'member'])
  })

  it('多个身份按固定顺序返回且不重复', () => {
    expect(resolveSubjects({ manager: true, initiator: true, member: true })).toEqual(['manager', 'dispatcher', 'member'])
    expect(resolveSubjects({ owner: true, lead: true })).toEqual(['owner', 'assignee', 'member'])
    expect(resolveSubjects({ initiator: true, lead: true })).toEqual(['dispatcher', 'assignee', 'member'])
  })

  it('模型主体由调用方给出，不从成员身份推导', () => {
    expect(resolveSubjects({ agent: 'assistant' })).toEqual(['assistant'])
    expect(resolveSubjects({ owner: true, agent: 'assistant' })).toEqual(['owner', 'assistant'])
  })

  it('没有身份时返回空列表', () => {
    expect(resolveSubjects({})).toEqual([])
  })
})

describe('多身份聚合', () => {
  it('空身份列表一律 deny，不落任何默认放行', () => {
    expect(canAny(asset('lab', 'rule'), [], 'inject')).toBe('deny')
    expect(canAny(asset('personal', 'rule'), [], 'write')).toBe('deny')
  })

  it('取最宽的结果：allow 高于 request 高于 deny', () => {
    expect(canAny(asset('lab', 'rule'), resolveSubjects({ manager: true }), 'write')).toBe('allow')
    expect(canAny(asset('lab', 'rule'), resolveSubjects({ member: true }), 'write')).toBe('request')
    expect(canAny(asset('lab', 'rule'), resolveSubjects({ manager: true, member: true }), 'write')).toBe('allow')
  })

  it('私有资产只认本人', () => {
    expect(canAny(asset('personal', 'rule'), resolveSubjects({ owner: true }), 'write')).toBe('allow')
    expect(canAny(asset('personal', 'rule'), resolveSubjects({ member: true }), 'write')).toBe('deny')
  })

  it('承接人提交组内链路是申请，派发人批准是允许', () => {
    expect(canAny(asset('lab', 'link'), resolveSubjects({ lead: true }), 'write')).toBe('request')
    expect(canAny(asset('lab', 'link'), resolveSubjects({ initiator: true }), 'approve')).toBe('allow')
  })
})
