/** 三层归属。rank 仅用于比较覆盖关系，不落库、不进契约、不进界面。 */
export const layers = ['system', 'lab', 'personal'] as const
export type Layer = (typeof layers)[number]
export const layerRank: Readonly<Record<Layer, number>> = { system: 3, lab: 2, personal: 1 }

/**
 * 内容类。rule / link / memory 是宪法内容：约束、方法、事实。
 * skill 归引擎（内置或插件），object 是当前工作对象，source 是参考材料。
 */
export const kinds = ['rule', 'link', 'skill', 'memory', 'object', 'source'] as const
export type Kind = (typeof kinds)[number]
export type KindGroup = 'constraint' | 'method' | 'fact' | 'work' | 'reference'
export const kindGroup: Readonly<Record<Kind, KindGroup>> = {
  rule: 'constraint',
  link: 'method',
  skill: 'method',
  memory: 'fact',
  object: 'work',
  source: 'reference',
}

/** 动作。读拆成注入（每轮）与检索（按需），写拆成写回、申请与批准。 */
export const actions = ['inject', 'search', 'write', 'request', 'approve'] as const
export type Action = (typeof actions)[number]
export const readActions: readonly Action[] = ['inject', 'search']

/** 主体。人是任务关系与组织角色，模型是三类职责。 */
export const subjects = [
  'owner',
  'manager',
  'dispatcher',
  'assignee',
  'member',
  'maintainer',
  'assistant',
  'planner',
  'executor',
] as const
export type Subject = (typeof subjects)[number]
