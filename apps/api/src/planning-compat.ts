import type { PlanModel } from '@research-agent-platform/contracts'

const directPlans = new Set(['createPlan', 'getPlan', 'editPlan'])
const planningReplies = new Set(['planRequest', 'getPlanRequest', 'cancelPlanning'])
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/** Wire-only projection after authorization/validation. Persisted plans and
 * idempotency receipts keep all fields regardless of the requesting client. */
export function planningProjection(name: string, value: unknown, modern: boolean): unknown {
  if (modern || (!directPlans.has(name) && name !== 'confirmPlan' && !planningReplies.has(name))) return value
  if (!record(value) || !record(value.data)) return value
  const legacy = (plan: unknown) => {
    if (!record(plan)) return plan
    const { outcome: _outcome, supplements: _supplements, ...rest } = plan as PlanModel
    return rest
  }
  const data = value.data
  if (directPlans.has(name)) return { ...value, data: legacy(data) }
  if (name === 'confirmPlan') return { ...value, data: { ...data, plan: legacy(data.plan) } }
  return record(data.reply)
    ? { ...value, data: { ...data, reply: { ...data.reply, plan: legacy(data.reply.plan) } } }
    : value
}
