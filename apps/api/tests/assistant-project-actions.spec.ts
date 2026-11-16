import { describe, expect, it } from 'vitest'
import { transaction } from '../src/database.js'
import { ChatService } from '../src/chat.js'
import { serviceFor, type ModelCall } from '../src/execution-worker.js'
import { assistantProject } from '../src/assistant-projects.js'
import { dispatchProjectAgent, sendProjectDecision, projectExecutionInput } from '../src/assistant-project-actions.js'
import { retractMessage } from '../src/chat-message-actions.js'
import { chatInputTokenBound } from '../src/chat-model-input.js'
import { OpenImBridge } from '../src/openim-bridge.js'
import { setupAssistantProject as setup, projectModelResult as result } from './helpers/assistant-project-fixture.js'

describe('project actions: actual HTTP/SQLite and model turns, synthetic model callbacks',()=>{
 it('detects a content omission from two real supplied files, performs a scoped specialist correction, reviews it and preserves owner acceptance',async()=>{
  const t=await setup()
  const brief=await t.file('brief.txt','任务说明：研究由方法A改为方法B，因为方法A无法识别观察周期内的早期变化。实验数量由负责人另行给出。')
  const draft=await t.file('draft.txt','方案原稿：本次使用方法B开展观察。原稿未写为什么改用方法B。')
  // An unrelated specialist conversation must not be imported into this run.
  const direct=(await t.call('createDirectConversation',{contactId:t.specialist.id})).value.data
  await t.call('agentChatMessage',{text:'无关私聊校验词 DO_NOT_FORWARD_THIS_HISTORY'},{id:direct.id})
  await t.tick(async()=>result('无关历史回复'))
  const {project}=await t.create([brief.id,draft.id])
  expect(await t.projectTick()).toBe(true)
  let phase=0
  const model:ModelCall=async input=>{
   const p=JSON.parse(input.prompt)
   expect(chatInputTokenBound(input.system,input.prompt)+input.maxTokens).toBeLessThanOrEqual(12000)
   expect(input.prompt).not.toContain('DO_NOT_FORWARD_THIS_HISTORY')
   expect(p.files.map((f:any)=>f.filename)).toEqual(['brief.txt','draft.txt'])
   expect(p.files.every((f:any)=>f.omittedCharacters===0)).toBe(true)
   if(phase++===0){expect(p.phase).toBe('work');return result('方案已改为方法B开展观察。')}
   if(phase===2){expect(p.phase).toBe('review');expect(p.instruction).toContain('方案已改为方法B');return result(JSON.stringify({assessment:'revise',summary:'原稿遗漏改为方法B的原因；任务说明已给出真实依据，无需问负责人。',instructions:'依据brief.txt补写：方法A无法识别观察周期内的早期变化，因此改为方法B。',question:null}))}
   if(phase===3){expect(p.phase).toBe('correction');expect(p.instruction).toContain('方法A无法识别');return result('方法A无法识别观察周期内的早期变化，因此本次改用方法B。实验数量尚未提供。')}
   expect(p.phase).toBe('review');return result(JSON.stringify({assessment:'decision',summary:'变更依据已根据真实任务说明补齐；实验数量没有材料支持，需负责人给出。',instructions:null,question:'方案改动原因已经补齐。本轮实验数量具体是多少？'}))
  }
  for(let i=0;i<4;i++){
   expect(await t.tick(model)).toBe(true)
   t.advance();expect(await t.projectTick()).toBe(true)
   if(i<3){t.advance();expect(await t.projectTick()).toBe(true)}
  }
  expect(phase).toBe(4)
  const messages=t.db.prepare('SELECT document FROM chat_messages WHERE conversation_id=? ORDER BY sequence').all(t.own.conversation.id).map(row=>JSON.parse(String(row.document)))
  const decision=messages.find(message=>String(message.text).startsWith('方案改动原因已经补齐。本轮实验数量具体是多少？'))
  expect(decision).toBeTruthy()
  expect(decision.text).toContain('方法A无法识别观察周期内的早期变化，因此本次改用方法B。')
  expect(messages.filter(message=>String(message.text).includes('要继续吗'))).toHaveLength(0)
  const internal=t.db.prepare("SELECT id FROM chat_conversations WHERE scope_key LIKE 'assistant-project-execution:%'").all().map(row=>row.id)
  const directory=(await t.call('chatConversations')).value.data
  expect(directory.some((conversation:{id:string})=>internal.includes(conversation.id))).toBe(false)
  const internalOutbox=t.db.prepare("SELECT o.status FROM im_message_outbox o JOIN chat_messages m ON m.id=o.message_id JOIN chat_conversations c ON c.id=m.conversation_id WHERE c.scope_key LIKE 'assistant-project-execution:%'").all()
  expect(internalOutbox.length).toBeGreaterThan(0)
  expect(internalOutbox.every(row=>row.status==='denied')).toBe(true)
  const bridge=new OpenImBridge(t.db,t.config)
  expect(internal).toHaveLength(2)
  for(const id of internal)expect(()=>bridge.mapping(t.s,String(id))).toThrow('NOT_FOUND')
  expect(bridge.conversations(t.s).conversations.some(mapping=>internal.includes(mapping.researchConversationId))).toBe(false)
  expect(t.db.prepare('SELECT status FROM im_message_outbox WHERE message_id=?').get(decision.id)?.status).toBe('pending')
  expect(t.db.prepare('SELECT count(*) n FROM chat_messages WHERE conversation_id=?').get(direct.id)?.n).toBe(2)
  expect(t.db.prepare("SELECT count(*) n FROM im_message_outbox o JOIN chat_messages m ON m.id=o.message_id WHERE m.conversation_id=? AND o.status='pending'").get(direct.id)?.n).toBe(2)
  const notice=await t.call('chatProjectNotice',null,{id:t.own.conversation.id,messageId:decision.id})
  expect(notice.value.data).toEqual({projectId:project.id,taskId:project.workTaskId,kind:'decision'})
  expect((await t.call('chatProjectNotice',null,{id:t.own.conversation.id,messageId:brief.id})).value.data).toBeNull()
  expect(t.db.prepare('SELECT status FROM personal_work_tasks WHERE id=?').get(project.workTaskId)?.status).toBe('active')
  expect(t.db.prepare('SELECT count(*) n FROM group_notices').get()?.n).toBe(0)
  const turns=t.db.prepare("SELECT count(*) n FROM chat_turns WHERE json_extract(request_json,'$.projectExecution.projectId')=?").get(project.id)?.n
  t.advance();await t.projectTick();t.advance();await t.projectTick()
  expect(t.db.prepare("SELECT count(*) n FROM chat_turns WHERE json_extract(request_json,'$.projectExecution.projectId')=?").get(project.id)?.n).toBe(turns)
  expect(t.db.prepare("SELECT count(*) n FROM assistant_project_events WHERE project_id=? AND kind='decision'").get(project.id)?.n).toBe(1)
 })

 it('keeps dispatch and original-chat owner decisions idempotent across service recreation',async()=>{
  const t=await setup(),{project,source}=await t.create()
  expect(await t.projectTick()).toBe(true)
  const context=t.context(project.id),commitment=t.commitment(project.id)
  const first=transaction(t.db,()=>dispatchProjectAgent(t.s,context,commitment))
  const fresh=new ChatService(serviceFor(t.db,t.s.c.actor.id,t.config).c,t.config)
  expect(transaction(t.db,()=>dispatchProjectAgent(fresh,context,commitment))).toEqual(first)
  const count=Number(t.db.prepare('SELECT count(*) n FROM chat_turns').get()!.n)
  const decision={key:'need-experiment-count',text:'资料尚未给出实验数量。这轮应采用多少个独立重复？',commitmentId:commitment.id}
  const id=transaction(t.db,()=>sendProjectDecision(t.s,context,decision))
  expect(transaction(t.db,()=>sendProjectDecision(fresh,context,decision))).toBe(id)
  const message=t.s.projectedMessage(id)
  expect(message.conversationId).toBe(t.own.conversation.id)
  expect(t.db.prepare('SELECT reply_to_id FROM chat_message_relations WHERE message_id=?').get(id)?.reply_to_id).toBe(source.message.id)
  expect(Number(t.db.prepare('SELECT count(*) n FROM chat_turns').get()!.n)).toBe(count)
  const canonicalCount=Number(t.db.prepare('SELECT count(*) n FROM chat_messages').get()!.n)
  await t.call('chatMessages',null,{id:t.own.conversation.id})
  await t.call('personalWorkTask',null,{id:project.workTaskId})
  await t.call('chatProjectNotice',null,{id:t.own.conversation.id,messageId:id})
  expect(Number(t.db.prepare('SELECT count(*) n FROM chat_messages').get()!.n)).toBe(canonicalCount)
  expect(t.db.prepare('SELECT count(*) n FROM im_message_outbox WHERE message_id=?').get(id)?.n).toBe(1)
  expect(()=>transaction(t.db,()=>sendProjectDecision(fresh,context,{...decision,text:'different'}))).toThrow('IDEMPOTENCY_CONFLICT')
 })

 it('uses exact bounded excerpt ranges and fences revoked file authority before a model call',async()=>{
  const t=await setup(),file=await t.file('large.txt','甲乙丙丁戊己庚辛壬癸'.repeat(9000)),{project}=await t.create([file.id])
  expect(await t.projectTick()).toBe(true)
  const commitment=t.commitment(project.id),checked=t.s.checkTurnInput(commitment.turnId!)
  const payload=projectExecutionInput(t.s,checked.input)
  expect(payload.files[0]!.omittedCharacters).toBeGreaterThan(0)
  const document=t.s.fileDocument(file.id,t.own.conversation.id)
  for(const excerpt of payload.files[0]!.excerpts)expect(excerpt.text).toBe(document.pages[0]!.text.slice(excerpt.start,excerpt.end))
  transaction(t.db,()=>retractMessage(t.s,t.own.conversation.id,file.id))
  expect(()=>t.s.checkTurnInput(commitment.turnId!)).toThrow('FORBIDDEN')
  let called=false
  await t.tick(async()=>{called=true;return result('must not run')})
  expect(called).toBe(false)
  expect(assistantProject(t.s,project.id).commitments[0]!.outputMessageId).toBeNull()
 })

 it('discards an in-flight reply when a selected original is withdrawn during execution',async()=>{
  const t=await setup(),file=await t.file('source.txt','方案依据：方法A无法识别早期变化。'),{project}=await t.create([file.id])
  expect(await t.projectTick()).toBe(true)
  const commitment=t.commitment(project.id)
  await t.tick(async()=>{
   transaction(t.db,()=>retractMessage(t.s,t.own.conversation.id,file.id))
   return result('This reply must not be committed after revocation.')
  })
  const row=t.db.prepare('SELECT status,document FROM chat_turns WHERE id=?').get(commitment.turnId!)!
  expect(JSON.parse(String(row.document)).outputMessageId).toBeNull()
  expect(['failed','cancelled','interrupted']).toContain(row.status)
  expect(t.db.prepare("SELECT count(*) n FROM chat_messages WHERE json_extract(document,'$.text')='This reply must not be committed after revocation.'").get()?.n).toBe(0)
 })
})
