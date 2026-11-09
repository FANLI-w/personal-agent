import type { DatabaseSync } from 'node:sqlite'
import { PLATFORM_WORK_RULE, WorkRule } from '@research-agent-platform/contracts'
import { compose, entrySize, type Entry } from '@research-agent-platform/constitution'

export type RulesContext = {
  readonly text: string
  readonly bytes: number
  readonly omitted: readonly string[]
  readonly ruleIds: readonly string[]
}
const platformEntry = (): Entry => ({ id:'platform-work-rule',version:PLATFORM_WORK_RULE.version,layer:'system',kind:'rule',title:'平台规则',content:PLATFORM_WORK_RULE.content })
const ruleEntry = (rule: WorkRule, layer: Entry['layer']): Entry => ({id:rule.id,version:rule.version,layer,kind:'rule',title:rule.title,content:rule.content})

/** A lab-wide conversation never inherits another project's private instructions. */
export function constitutionEntries(db: DatabaseSync, labId: string, projectId?: string): Entry[] {
  const entries: Entry[] = [platformEntry()]
  const rows=db.prepare("SELECT document FROM work_context_records WHERE lab_id=? AND ((scope='lab' AND scope_id=?) OR (scope='project' AND scope_id=?)) ORDER BY scope,id").all(labId,labId,projectId??'')
  for(const row of rows){
    const rule=WorkRule.parse(JSON.parse(String(row.document)))
    if(rule.kind==='rule'&&rule.status==='active')entries.push(ruleEntry(rule,'lab'))
  }
  return entries
}
export function entryBytes(layer:Entry['layer'],title:string,version:string|number,content:string,id='measure'):number{
  return entrySize({id,version,layer,kind:'rule',title,content})
}
export function activeRuleBytes(db:DatabaseSync,labId:string,excludeId?:string,projectId?:string):number{
  return constitutionEntries(db,labId,projectId).filter(e=>e.id!==excludeId).reduce((sum,e)=>sum+entrySize(e),0)
}
function render(entries:readonly Entry[],omitted:readonly string[]):RulesContext{
  const scoped=entries.some(e=>e.layer==='lab'),personal=entries.some(e=>e.layer==='personal')
  const title=scoped?'工作规则（按平台、课题组、项目顺序生效；个人偏好不能覆盖团队要求）：\n':personal?'工作规则（平台与个人层；个人偏好不能覆盖平台或团队要求）：\n':'工作规则（平台层；个人偏好不能覆盖团队要求）：\n'
  const labels={system:'平台',lab:'课题组',personal:'个人'}
  const text=entries.length?title+entries.map(e=>`[${labels[e.layer]}·${e.title} v${e.version}] ${e.content}`).join('\n'):''
  return{text,bytes:Buffer.byteLength(text,'utf8'),omitted,ruleIds:entries.map(e=>e.id)}
}
function assemble(entries:readonly Entry[]):RulesContext{
  // Mandatory constraints cannot disappear just to make a model call succeed.
  try{const result=compose(entries);return render(result.included,result.omitted)}
  catch(error){if(error instanceof Error&&error.message.includes('段超过上下文预算'))throw Error('BUDGET_EXCEEDED');throw error}
}
export function planningRulesContext(db:DatabaseSync,labId:string,projectId?:string,memberId?:string):RulesContext{
  return assemble([...constitutionEntries(db,labId,projectId),...(memberId?personalRuleEntries(db,memberId):[])])
}
export function platformRulesContext():RulesContext{return assemble([platformEntry()])}
export function personalRuleEntries(db:DatabaseSync,memberId:string):Entry[]{
  return db.prepare('SELECT document FROM personal_work_rules WHERE member_id=? ORDER BY id').all(memberId).flatMap(row=>{
    const rule=WorkRule.parse(JSON.parse(String(row.document)))
    return rule.scope==='personal'&&rule.scopeId===memberId&&rule.kind==='rule'&&rule.status==='active'?[ruleEntry(rule,'personal')]:[]
  })
}
export function activePersonalRuleBytes(db:DatabaseSync,memberId:string,excludeId?:string):number{
  return [platformEntry(),...personalRuleEntries(db,memberId)].filter(e=>e.id!==excludeId).reduce((sum,e)=>sum+entrySize(e),0)
}
export type ConversationScope={readonly id:string;readonly kind:'personal'|'direct'|'group';readonly labId:string}
export function conversationRulesContext(db:DatabaseSync,conversation:ConversationScope,memberId?:string):RulesContext&{readonly ruleScope:'lab'|'platform'}{
  if(conversation.kind==='group')return{...planningRulesContext(db,conversation.labId),ruleScope:'lab'}
  return{...assemble([platformEntry(),...(memberId?personalRuleEntries(db,memberId):[])]),ruleScope:'platform'}
}
