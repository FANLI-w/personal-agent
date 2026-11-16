import { describe,expect,it } from 'vitest'
import { ChatWorker } from '../src/chat-worker.js'
import { transaction } from '../src/database.js'
import { queueIntakeOutputRecovery } from '../src/intake-output-recovery.js'
import { chatInputTokenBound } from '../src/chat-model-input.js'
import { conversationRulesContext } from '../src/constitution-context.js'
import type { ModelInput } from '../src/execution-worker.js'
import { setupAssistantProject as setup,projectModelResult as result } from './helpers/assistant-project-fixture.js'

const limited=()=>({text:'',failure:'OUTPUT_LIMIT',finishReason:'max-tokens',inputTokens:3161,outputTokens:4096,elapsedMs:23857})
const child=(t:Awaited<ReturnType<typeof setup>>,id:string)=>t.db.prepare("SELECT * FROM chat_turns WHERE json_extract(request_json,'$.intakeOutputLimitRecovery.previousTurnId')=?").get(id)

describe('one active intake output-limit recovery; actual HTTP/SQLite, synthetic provider results',()=>{
 it('retains mandatory current context, recovers the exact failure profile after worker recreation and creates one project',async()=>{
  const t=await setup();t.config.constitutionRules=true
  for(let i=0;i<5;i++)expect((await t.call('createPersonalAgent',{displayName:`合成专业助理${i}`,introduction:'核对合成研究资料。',capabilityDescription:'比较提供的方案与记录，保留待核实事项。',personality:'直接、准确。'})).status).toBe(201)
  expect((await t.call('createPersonalMemory',{topic:'表达习惯',content:'先说明已核实事实与缺失依据。',scope:'general'})).status).toBe(201)
  const text='下周五的合成讨论稿交给你持续跟进，按这次提供的记录核对，准备好给我验收。合成原稿：实验数量尚未核实，不要编造。'
  const sent=await t.send(text);let first:ModelInput|undefined
  await t.tick(async input=>{first=input;return limited()})
  expect(first?.reasoningEffort).toBeUndefined()
  expect(t.s.turn(sent.turn.id)).toMatchObject({status:'failed',failure:'BUDGET_EXCEEDED',outputMessageId:null})
  expect(t.db.prepare('SELECT count(*) n FROM assistant_projects').get()!.n).toBe(0)
  expect(t.db.prepare('SELECT count(*) n FROM chat_actions').get()!.n).toBe(0)
  const retry=child(t,sent.turn.id)!,request=JSON.parse(String(retry.request_json))
  expect(retry.root_id).toBe(sent.turn.id);expect(request.budget).toEqual({maxTokens:8743,maxSeconds:66})
  expect(t.s.projectedMessage(sent.message.id).turnId).toBe(retry.id)
  let second:ModelInput|undefined
  await new ChatWorker(t.db,t.config,async input=>{
   second=input
   return result(JSON.stringify({kind:'project',project:{title:'合成持续讨论稿',goal:'忠实核对这次提供的合成记录。',dueAt:null,timeZone:'Asia/Shanghai',authorizationEvidence:text,sourceMessageIds:[sent.message.id],commitments:[{title:'核对合成原稿',kind:'agent',contactId:t.specialist.id,instructions:'核对本次提供的合成原稿，不编造实验数量。',acceptanceCriteria:'真实缺项必须保留。',dueAt:null}]}}))
  }).tick()
  expect(second?.reasoningEffort).toBe('off')
  const p=JSON.parse(second!.prompt),original=JSON.parse(first!.prompt)
  expect(p.currentRequest).toBe(text);expect(p.recentDialogue).toBeUndefined()
  expect(p.requestedAgent.profile).toEqual(original.requestedAgent.profile)
  expect(p.personalMemories).toEqual(original.personalMemories)
  const rules=conversationRulesContext(t.db,{id:t.own.conversation.id,kind:'personal',labId:null},t.s.c.actor.id).text
  expect(first!.system).toContain(rules);expect(second!.system).toContain(rules)
  expect(p.projectEntrySources.localSpecialists.map((c:{id:string})=>c.id)).toContain(t.specialist.id)
  expect(p.projectEntrySources.localSpecialists.every((c:{id:string})=>original.projectEntrySources.localSpecialists.some((old:{id:string})=>old.id===c.id))).toBe(true)
  expect(chatInputTokenBound(second!.system,second!.prompt)+second!.maxTokens).toBeLessThanOrEqual(8743)
  expect(second!.timeoutMs).toBe(66000);expect(second!.maxTokens).toBeGreaterThanOrEqual(1024)
  expect(t.s.turn(String(retry.id)).status).toBe('succeeded')
  expect(t.db.prepare('SELECT count(*) n FROM assistant_projects').get()!.n).toBe(1)
  expect(t.db.prepare('SELECT count(*) n FROM chat_messages WHERE conversation_id=? AND json_extract(document,\'$.origin\')=\'service\'').get(t.own.conversation.id)!.n).toBe(1)
  expect(transaction(t.db,()=>queueIntakeOutputRecovery(t.s,sent.turn.id))).toBe(false)
  expect(await new ChatWorker(t.db,t.config,async()=>{throw Error('No third call')}).tick()).toBe(false)
  expect(t.db.prepare('SELECT count(*) n FROM chat_attempts WHERE root_id=?').get(sent.turn.id)!.n).toBe(2)
  expect(t.db.prepare('SELECT count(*) n FROM chat_turns WHERE root_id=?').get(sent.turn.id)!.n).toBe(2)
 })

 it('recovers a casual question naturally without creating work or changing the next ordinary call policy',async()=>{
  const t=await setup(),sent=await t.send('这段话里的两个词怎么区分？')
  await t.tick(async()=>limited());expect(child(t,sent.turn.id)).toBeDefined()
  let second:ModelInput|undefined
  await t.tick(async input=>{second=input;return result(JSON.stringify({kind:'reply',answer:'前一个强调过程，后一个强调结果。',recordWork:false}))})
  expect(second!.system).toContain('A failed call never authorizes creating a project')
  expect(t.db.prepare('SELECT count(*) n FROM assistant_projects').get()!.n).toBe(0)
  expect(t.db.prepare('SELECT count(*) n FROM personal_work_tasks').get()!.n).toBe(0)
  const retry=child(t,sent.turn.id)!,turn=t.s.turn(String(retry.id))
  expect(t.s.projectedMessage(turn.outputMessageId!).text).toBe('前一个强调过程，后一个强调结果。')
  await t.send('再给一个简单例子。');let ordinary:ModelInput|undefined
  await t.tick(async input=>{ordinary=input;return result('一个描述怎么做，一个描述做成什么。')})
  expect(ordinary!.reasoningEffort).toBeUndefined()
 })

 it.each(['unknown_usage','exhausted','nonempty','unknown_failure','cancelled'] as const)('never replays unsafe failure %s',async boundary=>{
  const t=await setup(),sent=await t.send('这份合成稿交给你持续核对，完成后给我验收。')
  await t.tick(async()=>{
   if(boundary==='cancelled')await t.call('cancelChatTurn',{expectedVersion:t.s.turn(sent.turn.id).version},{id:sent.turn.id})
   return {...limited(),...(boundary==='unknown_usage'?{inputTokens:null}:{}),...(boundary==='exhausted'?{inputTokens:11800}:{}),...(boundary==='nonempty'?{text:'截断的可见草稿'}:{}),...(boundary==='unknown_failure'?{failure:'HARNESS_PROCESS_FAILED',inputTokens:null,outputTokens:null}:{} )}
  })
  expect(child(t,sent.turn.id)).toBeUndefined()
  expect(t.db.prepare('SELECT count(*) n FROM assistant_projects').get()!.n).toBe(0)
 })

 it('never retries when the failed call already streamed a visible provisional reply',async()=>{
  const t=await setup(),sent=(await t.call('agentChatMessage',{text:'解释一下这段合成文字。',continuous:true},{id:t.own.conversation.id})).value.data
  await new ChatWorker(t.db,t.config,async(_input,_signal,_credential,onDelta)=>{onDelta?.('已经显示的临时回复');return limited()},undefined,()=>Date.now()+5000).tick()
  expect(JSON.parse(String(t.db.prepare('SELECT request_json FROM chat_turns WHERE id=?').get(sent.turn.id)!.request_json)).continuous.text).toBe('已经显示的临时回复')
  expect(child(t,sent.turn.id)).toBeUndefined()
 })

 it('does not replay an old saved failure on startup and never retries the recovery again',async()=>{
  const t=await setup(),old=await t.send('先解释这个合成问题。')
  await t.tick(async()=>({...limited(),failure:'MODEL_FAILED'}))
  const prior=JSON.parse(String(t.db.prepare('SELECT request_json FROM chat_turns WHERE id=?').get(old.turn.id)!.request_json));prior.modelOutputDiagnostic={...prior.modelOutputDiagnostic,stage:'output_limit',failure:'OUTPUT_LIMIT'}
  const oldDocument=JSON.parse(String(t.db.prepare('SELECT document FROM chat_turns WHERE id=?').get(old.turn.id)!.document));oldDocument.failure='BUDGET_EXCEEDED'
  t.db.prepare('UPDATE chat_turns SET request_json=?,document=? WHERE id=?').run(JSON.stringify(prior),JSON.stringify(oldDocument),old.turn.id)
  expect(await t.tick(async()=>{throw Error('Old failures are not replayed')})).toBe(false)
  expect(child(t,old.turn.id)).toBeUndefined()
  const fresh=await t.send('这次合成讨论稿交给你持续跟进。');await t.tick(async()=>limited())
  expect(child(t,fresh.turn.id)).toBeDefined()
  await t.tick(async()=>limited())
  expect(await t.tick(async()=>{throw Error('No repeated recovery')})).toBe(false)
  expect(t.db.prepare('SELECT count(*) n FROM chat_turns WHERE root_id=?').get(fresh.turn.id)!.n).toBe(2)
 })
})
