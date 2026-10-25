import { z } from 'zod'
import { PlanInput, ProposedItem } from '@research-agent-platform/contracts'

// The model proposes research content. Identity, material access and dates are
// supplied by the service, never granted by fields copied from a prior Plan.
const DraftItem = ProposedItem.omit({ schedule: true, inputArtifactIds: true })
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
  return plan === null ? null : PlanInput.parse({ ...plan, labId, proposedItems: plan.proposedItems.map(item => ({ ...item, schedule: unknownSchedule(), inputArtifactIds: [] })) })
}
export function parsePlanningOutput(text: string, labId: string) {
  const answer = PlanningModelReply.parse(normalizedReply(text))
  return { intent: answer.intent, plan: planInput(answer.plan, labId) }
}
export function parsePlanningConversation(text: string, labId: string) {
  const reply = PlanningConversationReply.parse(normalizedReply(text))
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
