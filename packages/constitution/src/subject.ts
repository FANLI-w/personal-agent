import type { Subject } from './axis.js'

/**
 * 解析身份所需的事实。全部由调用方查库后传入：本函数不读数据库、不读时钟、不看环境，
 * 同样的输入必得同样的结果。
 *
 * 组内身份蕴含 `member`：负责人、派发人、承接人都是组成员，所以只要其中之一为真，
 * 结果里一定带 `member`。模型主体不从 `memberId` 推导，由调用方显式给出。
 */
export type ActorFacts = {
  readonly member?: boolean
  readonly manager?: boolean
  readonly owner?: boolean
  readonly initiator?: boolean
  readonly lead?: boolean
  readonly agent?: 'assistant' | 'planner' | 'executor'
}

/**
 * 把身份事实解析成主体列表，顺序固定，便于比对与回执。
 *
 * 读与写的继承规则不同：读可以带上主人的身份，因为助理要能读到主人的任务才能传达；
 * 写不能继承，否则助理替主人写共享资产就绕过了「申请」。调用方按用途决定传哪组事实。
 */
export function resolveSubjects(facts: ActorFacts): Subject[] {
  const subjects: Subject[] = []
  const add = (subject: Subject) => {
    if (!subjects.includes(subject)) subjects.push(subject)
  }
  const inLab = facts.member === true || facts.manager === true || facts.initiator === true || facts.lead === true
  if (facts.owner) add('owner')
  if (facts.manager) add('manager')
  if (facts.initiator) add('dispatcher')
  if (facts.lead) add('assignee')
  if (inLab) add('member')
  if (facts.agent) add(facts.agent)
  return subjects
}
