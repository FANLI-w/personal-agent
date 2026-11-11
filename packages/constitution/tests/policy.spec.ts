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

  it('任务级资产由派发人与承接人共管，其他成员读不到', () => {
    expect(can(asset('lab', 'object'), 'dispatcher', 'write')).toBe('allow')
    expect(can(asset('lab', 'object'), 'assignee', 'write')).toBe('allow')
    expect(can(asset('lab', 'object'), 'member', 'inject')).toBe('deny')
    expect(can(asset('lab', 'source'), 'assignee', 'write')).toBe('allow')
  })

  it('助理能读到任务档案以便传达，写入仍走申请', () => {
    expect(can(asset('lab', 'object'), 'assistant', 'inject')).toBe('allow')
    expect(can(asset('lab', 'object'), 'assistant', 'write')).toBe('request')
    expect(can(asset('lab', 'object'), 'assignee', 'request')).toBe('allow')
  })

  it('交接由派发人与承接人写，申请由助理提交，负责人不直接写', () => {
    expect(can(asset('lab', 'memory'), 'dispatcher', 'write')).toBe('allow')
    expect(can(asset('lab', 'memory'), 'assignee', 'write')).toBe('allow')
    expect(can(asset('lab', 'memory'), 'manager', 'write')).toBe('deny')
    expect(can(asset('lab', 'memory'), 'assistant', 'request')).toBe('allow')
  })

  it('课题组级资产全组可读，写入经负责人批准', () => {
    expect(can(asset('lab', 'rule'), 'member', 'inject')).toBe('allow')
    expect(can(asset('lab', 'rule'), 'member', 'write')).toBe('request')
    expect(can(asset('lab', 'rule'), 'member', 'approve')).toBe('deny')
    expect(can(asset('lab', 'rule'), 'manager', 'approve')).toBe('allow')
    expect(can(asset('lab', 'link'), 'assignee', 'write')).toBe('request')
    // 粗判只说明派发人这一类可能被允许；具体到某条链路由 approves() 收窄到来源任务的发起人。
    expect(can(asset('lab', 'link'), 'dispatcher', 'approve')).toBe('allow')
  })

  it('个人层以本人为批准人', () => {
    // 助理写个人规则还没有申请通道，所以 request 清空，助理写入按拒绝处理。
    expect(can(asset('personal', 'rule'), 'assistant', 'write')).toBe('deny')
    expect(can(asset('personal', 'rule'), 'assistant', 'inject')).toBe('allow')
    expect(can(asset('personal', 'rule'), 'owner', 'approve')).toBe('allow')
    expect(can(asset('personal', 'rule'), 'manager', 'inject')).toBe('deny')
    expect(approverOf(asset('personal', 'rule'))).toBe('owner')
  })

  it('个人任务属于个人资产，本人直接写，助理写回也放行', () => {
    expect(can(asset('personal', 'object'), 'owner', 'write')).toBe('allow')
    expect(can(asset('personal', 'object'), 'assistant', 'write')).toBe('allow')
    expect(can(asset('personal', 'object'), 'member', 'inject')).toBe('deny')
  })

  it('本人能改自己的记忆，助理自动写回同样放行', () => {
    // 实现里 personal-memories 的 memory() 已给本人 edit 与 revoke，表此前漏了 owner。
    expect(can(asset('personal', 'memory'), 'owner', 'write')).toBe('allow')
    expect(can(asset('personal', 'memory'), 'assistant', 'write')).toBe('allow')
    expect(can(asset('personal', 'memory'), 'member', 'inject')).toBe('deny')
  })

  it('批准人按归属层固定', () => {
    expect(approverOf(asset('system', 'rule'))).toBe('maintainer')
    expect(approverOf(asset('lab', 'rule'))).toBe('manager')
    expect(approverOf(asset('personal', 'memory'))).toBe('owner')
  })
  it('运行时未知主体和动作不能借用默认读取或批准分支',()=>{
    expect(can(asset('lab','rule'),'unknown' as never,'inject')).toBe('deny')
    expect(can(asset('personal','rule'),'owner','unknown' as never)).toBe('deny')
  })
})
