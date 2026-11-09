import { describe, expect, it } from 'vitest'
import { actions, approverOf, asset, can, defaultGrants } from '../src/index.js'

describe('权限判定', () => {
  it('未登记的组合一律 deny', () => {
    expect(can(asset('personal', 'source'), 'owner', 'inject')).toBe('deny')
    expect(can(asset('system', 'link'), 'maintainer', 'write')).toBe('deny')
  })

  it('每条授予对任意主体都返回确定结论，不会缺省放行', () => {
    for (const grant of defaultGrants) {
      for (const action of actions) {
        const decision = can({ layer: grant.layer, kind: grant.kind }, 'member', action)
        expect(['allow', 'deny', 'request']).toContain(decision)
      }
    }
  })

  it('模型写共享资产只能提交申请，写自己的记忆可直接生效', () => {
    expect(can(asset('lab', 'rule'), 'assistant', 'write')).toBe('deny')
    expect(can(asset('lab', 'object'), 'assistant', 'write')).toBe('request')
    expect(can(asset('personal', 'memory'), 'assistant', 'write')).toBe('allow')
  })

  it('任务级资产授予派发人与承接人，其他成员读不到', () => {
    expect(can(asset('lab', 'object'), 'dispatcher', 'write')).toBe('allow')
    expect(can(asset('lab', 'object'), 'assignee', 'write')).toBe('deny')
    expect(can(asset('lab', 'object'), 'member', 'inject')).toBe('deny')
    expect(can(asset('lab', 'source'), 'assignee', 'write')).toBe('allow')
  })

  it('课题组级资产全组可读，写入经负责人批准', () => {
    expect(can(asset('lab', 'rule'), 'member', 'inject')).toBe('allow')
    expect(can(asset('lab', 'rule'), 'member', 'write')).toBe('request')
    expect(can(asset('lab', 'rule'), 'member', 'approve')).toBe('deny')
    expect(can(asset('lab', 'rule'), 'manager', 'approve')).toBe('allow')
    expect(can(asset('lab', 'link'), 'assignee', 'write')).toBe('request')
  })

  it('个人层以本人为批准人', () => {
    expect(can(asset('personal', 'rule'), 'assistant', 'write')).toBe('request')
    expect(can(asset('personal', 'rule'), 'owner', 'approve')).toBe('allow')
    expect(can(asset('personal', 'rule'), 'manager', 'inject')).toBe('deny')
    expect(approverOf(asset('personal', 'rule'))).toBe('owner')
  })

  it('批准人按归属层固定', () => {
    expect(approverOf(asset('system', 'rule'))).toBe('maintainer')
    expect(approverOf(asset('lab', 'rule'))).toBe('manager')
    expect(approverOf(asset('personal', 'memory'))).toBe('owner')
  })
})
