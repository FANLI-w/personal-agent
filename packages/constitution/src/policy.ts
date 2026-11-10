import { actions, subjects, readActions, type Action, type Kind, type Layer, type Subject } from './axis.js'
import type { Asset } from './asset.js'

/**
 * allow：直接生效。
 * request：允许提交申请，写入要经批准人。模型的写入走这一档。
 * deny：不授予。任何未登记的组合都落在这里。
 */
export type Decision = 'allow' | 'deny' | 'request'

/**
 * 一条授予。read 用 'all' 表示全组或全平台；其余用主体列表，空列表表示未授予。
 *
 * 列表表达的是**主体类**，不是最终判定：`deny` 是终局拒绝，`allow` 与 `request`
 * 表示这一类主体可能被允许，具体到某一条记录还要过条目级条件。条目级条件由路由层
 * 判断，因为 `Asset` 只有 layer 与 kind 两个维度，表达不了下列三种限制：
 * - 链路的批准人必须是该链路来源任务的发起人（`tasks.initiator_id`）；
 * - `assignee` 写交接只能写自己那一段；
 * - `assistant` 只能读主人的任务，不能读全组的任务。
 * 这三条在 `apps/api/src/work-context.ts` 的 `approves()` 与各路由里实现。
 */
export type Grant = {
  readonly layer: Layer
  readonly kind: Kind
  readonly read: 'all' | readonly Subject[]
  readonly write: readonly Subject[]
  readonly request: readonly Subject[]
  readonly approve: readonly Subject[]
}

/** 默认授予，对应框架文档 §2 的三张权限表。接线时可按场景传入替代表。 */
export const defaultGrants: readonly Grant[] = [
  { layer: 'system', kind: 'rule', read: 'all', write: ['maintainer'], request: [], approve: ['maintainer'] },
  { layer: 'lab', kind: 'rule', read: 'all', write: ['manager'], request: ['member'], approve: ['manager'] },
  { layer: 'lab', kind: 'link', read: 'all', write: [], request: ['dispatcher', 'assignee'], approve: ['dispatcher', 'manager'] },
  { layer: 'lab', kind: 'skill', read: 'all', write: [], request: [], approve: [] },
  { layer: 'lab', kind: 'memory', read: 'all', write: ['dispatcher', 'assignee'], request: ['assistant'], approve: ['manager'] },
  { layer: 'lab', kind: 'object', read: ['dispatcher', 'assignee', 'assistant'], write: ['dispatcher', 'assignee'], request: ['assignee', 'assistant'], approve: ['dispatcher'] },
  { layer: 'lab', kind: 'source', read: ['dispatcher', 'assignee'], write: ['dispatcher', 'assignee'], request: ['assistant'], approve: ['dispatcher'] },
  { layer: 'personal', kind: 'rule', read: ['owner', 'assistant'], write: ['owner'], request: ['assistant'], approve: ['owner'] },
  { layer: 'personal', kind: 'memory', read: ['owner', 'assistant'], write: ['assistant'], request: [], approve: ['owner'] },
  { layer: 'personal', kind: 'object', read: ['owner', 'assistant'], write: ['owner', 'assistant'], request: [], approve: ['owner'] },
]

const covered = (list: 'all' | readonly Subject[], subject: Subject) =>
  list === 'all' || list.includes(subject)

export function grantOf(target: Asset, grants: readonly Grant[] = defaultGrants): Grant | undefined {
  return grants.find(grant => grant.layer === target.layer && grant.kind === target.kind)
}

export function can(
  target: Asset,
  subject: Subject,
  action: Action,
  grants: readonly Grant[] = defaultGrants,
): Decision {
  if (!subjects.includes(subject) || !actions.includes(action)) return 'deny'
  const grant = grantOf(target, grants)
  if (!grant) return 'deny'
  if (readActions.includes(action)) return covered(grant.read, subject) ? 'allow' : 'deny'
  if (action === 'write') {
    if (grant.write.includes(subject)) return 'allow'
    return grant.request.includes(subject) ? 'request' : 'deny'
  }
  if (action === 'request') return grant.request.includes(subject) ? 'allow' : 'deny'
  return grant.approve.includes(subject) ? 'allow' : 'deny'
}

/** 批准人按作用域固定：系统层是维护者，课题组层是负责人，个人层是本人。 */
export function approverOf(target: Asset): Subject {
  if (target.layer === 'system') return 'maintainer'
  if (target.layer === 'lab') return 'manager'
  return 'owner'
}
