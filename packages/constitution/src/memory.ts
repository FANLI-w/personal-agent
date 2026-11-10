/**
 * 记忆的四类生命周期。前两类是长期，第三类绑定任务版本，第四类只在单轮存活。
 * 这个标注只用于回执与文档对齐，不参与装配判定，也不落库。
 */
export const lifecycles = ['preference', 'conclusion', 'handoff', 'turn'] as const
export type Lifecycle = (typeof lifecycles)[number]

/** 各生命周期在代码里的落点。写入与装配仍各在各表，这里只记录对应关系。 */
export const lifecycleSource: Readonly<Record<Lifecycle, string>> = {
  preference: 'personal_memories 与 chat_memories（助手自身的偏好）',
  conclusion: 'conclusions 与 conclusion_versions，绑定来源任务与交付物版本',
  handoff: 'task_handoffs，绑定任务版本，指纹不符即作废',
  turn: '当前消息，不存储',
}

/**
 * 把四类计数写成一行回执，缺省为 0。
 * 缺席也写出来，因为「这一轮没有结论进入」本身就是需要看见的事实。
 */
export function lifecycleReceipt(counts: Partial<Record<Lifecycle, number>>): string {
  return lifecycles.map(lifecycle => `${lifecycle}:${counts[lifecycle] ?? 0}`).join('/')
}
