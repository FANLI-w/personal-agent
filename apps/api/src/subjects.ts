import { asset, canAny, resolveSubjects, type Action, type ActorFacts, type Decision, type Kind, type Layer } from '@research-agent-platform/constitution'
import { ApiError } from './errors.js'

/**
 * 判定某个行为者在某个上下文里能对某类资产做什么。
 * 身份由事实解析，不在本函数里查库；读与写的继承规则不同，由调用方传对应的事实：
 * 读可以带上主人身份，写只取行为者自身，否则助理替主人写共享资产会绕过申请。
 */
export function decisionFor(layer: Layer, kind: Kind, facts: ActorFacts, action: Action): Decision {
  return canAny(asset(layer, kind), resolveSubjects(facts), action)
}

/**
 * `decisionFor` 的严格版本：只有 `allow` 放行。
 *
 * - 私有资产（`personal` 层）拒绝时按不存在处理，不暴露存在性；共享资产返回 `FORBIDDEN`。
 * - `request` 目前没有申请通道，按拒绝处理。有落点的地方（例如提交组内链路后进入候选）不要用本函数，
 *   改用 `decisionFor` 自己分支，别在这里顺手放行。
 */
export function assertAllowed(layer: Layer, kind: Kind, facts: ActorFacts, action: Action): void {
  if (decisionFor(layer, kind, facts, action) === 'allow') return
  throw new ApiError(layer === 'personal' ? 'NOT_FOUND' : 'FORBIDDEN')
}
