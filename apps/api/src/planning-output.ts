import { z } from 'zod'
import { Allocation, PlanInput, ProposedItem } from '@research-agent-platform/contracts'

// The model proposes research content. Identity, material access and dates are
// supplied by the service, never granted by fields copied from a prior Plan.
// Dispatch is decided by people, so `claim` is not a shape the planner may emit;
// public capability stays open because it is an explicit allocation, not a claim.
type AllocationOption = (typeof Allocation.options)[number]
const DraftAllocation = z.discriminatedUnion(
  'kind',
  Allocation.options.filter(option => option.shape.kind.value !== 'claim') as unknown as [AllocationOption, ...AllocationOption[]],
)
const CompleteDraftItem = ProposedItem.omit({ schedule: true, inputArtifactIds: true }).extend({ allocation: DraftAllocation })
// Only explicitly unfinished items may omit research details. Identity, status
// and allocation still follow the normal schema; executable items remain strict.
const RoughDraftItem = CompleteDraftItem.partial({ goal: true, deliverable: true, acceptanceCriteria: true }).extend({
  status: z.enum(['待定', '阻塞']), missing: z.enum(['缺依赖', '缺信息']),
})
const DraftItem = z.union([CompleteDraftItem, RoughDraftItem])
const Draft = PlanInput.omit({ labId: true }).extend({ proposedItems: z.array(DraftItem).max(100) })
export const PlanningModelReply = z.strictObject({ intent: z.enum(['draft', 'progress', 'find_work']), plan: Draft.nullable() })
export const PlanningConversationReply = z.strictObject({ answer: z.string().trim().min(1).max(8000), plan: Draft.nullable() })
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const unknownSchedule = () => ({ suggested: null, hardDeadline: null, committed: null, checkpoint: null, estimatedHumanHours: null })

function normalizedReply(text: string) {
  const raw: unknown = JSON.parse(text.trim().replace(/^\uFEFF/, '').replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''))
  let normalized = raw
  if (record(raw) && record(raw.plan)) {
    const { labId: _lab, id: _id, ownerId: _owner, version: _version, status: _status, createdAt: _created, conclusionRefs: _refs, ...draft } = raw.plan
    normalized = { ...raw, plan: { ...draft, proposedItems: Array.isArray(draft.proposedItems) ? draft.proposedItems.map(item => {
      if (!record(item)) return item
      const { schedule: _schedule, inputArtifactIds: _inputs, ...content } = item
      return content
    }) : draft.proposedItems } }
  }
  return normalized
}
function planInput(plan: z.infer<typeof Draft> | null, labId: string) {
  if (plan === null) return null
  const items = plan.proposedItems.map(item => ({
    ...item,
    goal: item.goal ?? '目标待确认',
    deliverable: item.deliverable ?? '预期产物待确认',
    acceptanceCriteria: item.acceptanceCriteria ?? '待信息补齐后确定',
    schedule: unknownSchedule(), inputArtifactIds: [],
  }))
  const ids = new Set(items.map(item => item.id))
  // A supplement whose node disappeared is dropped here, not rejected later: a stale
  // anchor must never fail the whole turn.
  const supplements = plan.supplements?.filter(supplement => ids.has(supplement.nodeId))
  return PlanInput.parse({ ...plan, labId, proposedItems: items, ...(supplements ? { supplements } : {}) })
}
export function parsePlanningOutput(text: string, labId: string) {
  const answer = PlanningModelReply.parse(normalizedReply(text))
  return { intent: answer.intent, plan: planInput(answer.plan, labId) }
}
export function parsePlanningConversation(text: string, labId: string) {
  // The request carries `intent`, the reply schema does not: drop an echoed copy
  // instead of failing the turn on a field the model was shown but cannot use.
  const normalized = normalizedReply(text)
  const echoed = record(normalized) && 'intent' in normalized
    ? (() => { const { intent: _intent, ...rest } = normalized; return rest })()
    : normalized
  const reply = PlanningConversationReply.parse(echoed)
  return { answer: reply.answer, plan: planInput(reply.plan, labId) }
}

// Diagnose shape/stage only. Never store model prose, quotes, keys or issue
// messages (JSON/Zod messages can contain user material or arbitrary field names).
export function planningOutputDiagnostic(text: string, stage: string, error: unknown, finishReason?: string) {
  const fields = new Set(['intent', 'answer', 'plan', ...Object.keys(PlanInput.shape), ...Object.keys(ProposedItem.shape), 'kind', 'memberId', 'audience', 'summary', 'capability', 'humanLeadId', 'missingReason', 'maxTokens', 'maxSeconds'])
  let shape: { intent?: string; plan: string; hasAnswer: boolean } | undefined
  try {
    const raw = normalizedReply(text)
    if (record(raw)) shape = { ...(raw.intent === 'draft' || raw.intent === 'progress' || raw.intent === 'find_work' ? { intent: raw.intent } : {}), plan: raw.plan === null ? 'null' : record(raw.plan) ? 'object' : 'missing_or_invalid', hasAnswer: typeof raw.answer === 'string' && !!raw.answer.trim() }
  } catch { /* Shape is unavailable for malformed JSON; never retain the body. */ }
  return {
    stage,
    returnedTextLength: text.length,
    ...(shape ? { shape } : {}),
    ...(finishReason && /^[a-z_-]{1,64}$/.test(finishReason) ? { finishReason } : {}),
    category: error instanceof z.ZodError ? 'schema' : error instanceof SyntaxError ? 'json' : stage === 'persistence' ? 'persistence' : 'validation',
    ...(error instanceof z.ZodError ? { issues: error.issues.slice(0, 6).map(issue => ({ code: issue.code, path: issue.path.slice(0, 8).map(part => typeof part === 'number' ? part : fields.has(String(part)) ? String(part) : '<field>') })) } : {}),
  }
}
