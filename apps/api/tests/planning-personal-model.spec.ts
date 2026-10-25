import {randomBytes,randomUUID} from 'node:crypto'
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach,describe,it,expect} from 'vitest'
import {routes,AdaptiveReply,type RouteName} from '@research-agent-platform/contracts'
import {readConfig} from '../src/config.js'
import {migrate,openDatabase,seed} from '../src/database.js'
import {provisionTestAccounts} from '../src/auth.js'
import {createServer} from '../src/server.js'
import {ExecutionWorker,type ModelCall,type ModelResult} from '../src/execution-worker.js'

const cleanup:(()=>unknown|Promise<unknown>)[]=[]
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn()})
const budget={maxTokens:100000,maxSeconds:30},schedule={suggested:null,hardDeadline:null,committed:null,estimatedHumanHours:null,checkpoint:null}
const output=(labId='lab_synthetic'):ModelResult=>({text:JSON.stringify({intent:'draft',plan:{labId,goal:'Synthetic owned draft',proposedItems:[],unresolvedQuestions:[]}}),failure:null,inputTokens:100,outputTokens:100,elapsedMs:10})
async function setup(){
  const dir=mkdtempSync(join(tmpdir(),'planning-personal-'));cleanup.push(()=>rmSync(dir,{recursive:true,force:true}))
  const master=join(dir,'synthetic-master.key');writeFileSync(master,randomBytes(32).toString('hex'),{mode:0o600})
  const config=readConfig({NODE_ENV:'test',DATABASE_PATH:join(dir,'db.sqlite'),BLOB_ROOT:join(dir,'blobs'),APP_ORIGIN:'http://127.0.0.1:4498',B3_AI_ENABLED:'1',LAB_CREDENTIAL_KEY_FILE:master})
  mkdirSync(config.blobRoot);const db=openDatabase(config.databasePath,true);cleanup.push(()=>db.close());migrate(db);seed(db,'test')
  const accounts=['A','B'].map(letter=>({memberId:`member_${letter}`,username:`synthetic_planning_${letter}`,password:randomBytes(24).toString('hex')}));await provisionTestAccounts(db,'test',accounts)
  db.prepare('INSERT INTO lab_managers(lab_id,member_id,granted_at) VALUES (?,?,?)').run('lab_synthetic','member_A',new Date().toISOString())
  let app=createServer(config),url=await app.listen({host:'127.0.0.1',port:0});cleanup.push(()=>app.close())
  const people:{cookie:string;csrf:string}[]=[]
  const call=async(name:RouteName,body:unknown=null,params:Record<string,string>={},actor=0,key=randomUUID())=>{
    const route=routes[name],response=await fetch(url+route.path.replace(/\{(\w+)\}/g,(_,name:string)=>params[name]!),{method:route.method,headers:{origin:config.origin,'content-type':'application/json','Idempotency-Key':key,...(people[actor]?{cookie:people[actor].cookie,'x-csrf-token':people[actor].csrf}:{})},...(route.method==='GET'?{}:{body:JSON.stringify(body)})})
    const text=await response.text(),value=JSON.parse(text);if(response.ok)route.response.parse(value)
    return {status:response.status,value,text,cookie:response.headers.get('set-cookie')?.split(';')[0]??''}
  }
  const ok=async(name:RouteName,body:unknown=null,params:Record<string,string>={},actor=0,key=randomUUID())=>{const r=await call(name,body,params,actor,key);expect(r.status,r.text).toBeLessThan(300);return r.value.data}
  for(let actor=0;actor<accounts.length;actor++){const a=accounts[actor]!,login=await call('login',{username:a.username,password:a.password},{},actor);expect(login.status).toBe(200);people[actor]={cookie:login.cookie,csrf:''};people[actor]!.csrf=(await ok('session',null,{},actor)).csrfToken}
  const personal=(actor=0,provider='qwen',model='qwen-test')=>ok('createPersonalModel',{name:'Synthetic owned model',provider,model,enabled:true,apiKey:`synthetic-owned-key-${actor}`},{},actor)
  const lab=()=>ok('updateLabAiSettings',{expectedVersion:0,enabled:true,model:'deepseek-flash',apiKey:'sk-synthetic-legacy-manager-key'},{id:'lab_synthetic'})
  const planBody={labId:'lab_synthetic',prompt:'Organize the synthetic task',intent:'draft',inputArtifactIds:[],budget}
  const planning=(actor=0,key=randomUUID())=>ok('planRequest',planBody,{},actor,key)
  const detail=(id:string,actor=0)=>ok('getPlanRequest',null,{id},actor)
  const worker=(fn:ModelCall)=>new ExecutionWorker(db,config,fn)
  return {db,config,call,ok,personal,lab,planBody,planning,detail,worker,restart:async()=>{await app.close();app=createServer(config);url=await app.listen({host:'127.0.0.1',port:0})}}
}
describe('owned personal planning with real HTTP and isolated synthetic credentials',{timeout:30000},()=>{
  it('keeps discussion separate from plan revisions and returns the actual answer after restart, with no task creation',async()=>{
    const s=await setup();await s.personal()
    const counts=()=>['plans','tasks','assignments'].map(table=>Number(s.db.prepare('SELECT count(*) n FROM '+table).get()!.n))
    const before=counts(),body={...s.planBody,replyMode:'conversation'},first=await s.ok('planRequest',body)
    await s.worker(async input=>{
      expect(input.system).toContain('Always put your actual reply in answer')
      return {...output(),text:JSON.stringify({answer:'Synthetic first judgment: strengthen the evidence before adding experiments.',plan:null})}
    }).tick()
    await s.restart()
    expect(await s.detail(first.id)).toMatchObject({status:'ready',planId:null,reply:{message:'Synthetic first judgment: strengthen the evidence before adding experiments.',plan:null,actions:[]},usage:{inputTokens:100,outputTokens:100}})
    expect(counts()).toEqual(before)
    const stored=s.db.prepare('SELECT document,request_json FROM execution_jobs WHERE id=?').get(first.id)!
    const oldReply=JSON.parse(String(stored.document)).reply
    expect(Object.hasOwn(oldReply,'message')).toBe(false)
    expect(()=>AdaptiveReply.omit({message:true}).parse(oldReply)).not.toThrow()
    expect(JSON.parse(String(stored.request_json)).conversationAnswer).toBe('Synthetic first judgment: strengthen the evidence before adding experiments.')
    expect((await s.call('getPlanRequest',null,{id:first.id},1)).status).toBe(404)
    const next=await s.ok('planRequest',body)
    await s.worker(async()=>({...output(),text:JSON.stringify({answer:'Synthetic proposal: compare the strongest baseline first.',plan:{goal:'Synthetic proposal',proposedItems:[],unresolvedQuestions:[]}})})).tick()
    const draft=await s.detail(next.id),plan=draft.reply.plan
    expect(draft).toMatchObject({status:'draft',reply:{message:'Synthetic proposal: compare the strongest baseline first.',actions:[{object:'plan',action:'confirm'}]}})
    const discussion=await s.ok('planRequest',{...body,plan:{id:plan.id,version:plan.version}})
    await s.worker(async()=>({...output(),text:JSON.stringify({answer:'Synthetic follow-up: the current plan can stay while we compare the alternatives.',plan:null})})).tick()
    expect(await s.detail(discussion.id)).toMatchObject({status:'ready',planId:plan.id,reply:{plan:null,actions:[]}})
    expect(await s.ok('getPlan',null,{id:plan.id})).toEqual(plan)
    expect(counts()).toEqual([before[0]!+1,...before.slice(1)])
  })
  it('does not turn a missing or blank conversational answer into success and preserves existing drafts and actual usage',async()=>{
    const s=await setup();await s.personal();const first=await s.planning()
    await s.worker(async()=>output()).tick();const prior=(await s.detail(first.id)).reply.plan
    for(const reply of [{intent:'draft',plan:null},{answer:'  ',plan:null}]){
      const job=await s.ok('planRequest',{...s.planBody,replyMode:'conversation',plan:{id:prior.id,version:prior.version}})
      await s.worker(async()=>({...output(),text:JSON.stringify(reply)})).tick()
      expect(await s.detail(job.id)).toMatchObject({status:'failed',failure:'INVALID_MODEL_OUTPUT',usage:{inputTokens:100,outputTokens:100}})
      expect(await s.ok('getPlan',null,{id:prior.id})).toEqual(prior)
      const receipt=JSON.parse(String(s.db.prepare('SELECT result_json FROM execution_attempts WHERE job_id=?').get(job.id)!.result_json))
      expect(receipt).toMatchObject({text:'',planningOutputDiagnostic:{category:'schema',shape:{plan:'null',hasAnswer:false}}})
    }
    const failedSave=await s.ok('planRequest',{...s.planBody,replyMode:'conversation',plan:{id:prior.id,version:prior.version}})
    s.db.exec(`CREATE TRIGGER synthetic_conversation_write_failure BEFORE UPDATE ON execution_jobs WHEN NEW.id='${failedSave.id}' AND json_extract(NEW.document,'$.status')='ready' BEGIN SELECT RAISE(ABORT,'synthetic_write_failure'); END`)
    await s.worker(async()=>({...output(),text:JSON.stringify({answer:'PRIVATE_REPLY_MUST_ROLL_BACK',plan:null})})).tick()
    expect(await s.detail(failedSave.id)).toMatchObject({status:'failed',failure:'PLANNING_SAVE_FAILED',reply:null,usage:{inputTokens:100,outputTokens:100}})
    expect(await s.ok('getPlan',null,{id:prior.id})).toEqual(prior)
    const stored=s.db.prepare('SELECT request_json FROM execution_jobs WHERE id=?').get(failedSave.id)!
    expect(JSON.parse(String(stored.request_json)).conversationAnswer).toBeUndefined()
  })
  it('fences conversational replies when the bound colleague changes, without exposing late content or losing usage',async()=>{
    const s=await setup();await s.personal()
    const agent=await s.ok('createPersonalAgent',{displayName:'Synthetic colleague',introduction:'Synthetic',capabilityDescription:'Synthetic research',personality:'Original style'})
    const conversation=await s.ok('createDirectConversation',{contactId:agent.id})
    const job=await s.ok('planRequest',{...s.planBody,replyMode:'conversation',colleague:{contactId:agent.id,conversationId:conversation.id}})
    await s.worker(async()=>{
      await s.ok('updateContactProfile',{displayName:agent.displayName,introduction:agent.profile.introduction,capabilityDescription:agent.profile.capabilityDescription,personality:'Changed style',expectedVersion:agent.profile.version},{id:agent.id})
      return {...output(),text:JSON.stringify({answer:'LATE_REPLY_MUST_NOT_APPEAR',plan:null})}
    }).tick()
    const response=await s.detail(job.id)
    expect(response).toMatchObject({status:'cancelled',failure:'AGENT_CONTEXT_CHANGED',reply:null,usage:{inputTokens:100,outputTokens:100}})
    expect(JSON.stringify(response)).not.toContain('LATE_REPLY_MUST_NOT_APPEAR')
  })
  const colleague=async(s:Awaited<ReturnType<typeof setup>>,actor=0)=>{
    const agent=await s.ok('createPersonalAgent',{displayName:`Colleague ${actor}`,introduction:'Synthetic research colleague',capabilityDescription:'Discuss evidence and draft tasks',personality:`PERSONA_${actor}: lead with a judgment, then help a small next step`},{},actor)
    const conversation=await s.ok('createDirectConversation',{contactId:agent.id},{},actor)
    return {agent,ref:{contactId:agent.id,conversationId:conversation.id}}
  }
  it('uses the same owned colleague profile and authorized private preferences after restart, without sharing another colleague or account',async()=>{
    const s=await setup();await s.personal();const a=await colleague(s),b=await colleague(s,1)
    const memory=await s.ok('createChatMemory',{scope:'private_agent',scopeId:a.agent.id,content:'PRIVATE_A_STYLE: first state the most useful evidence gap',source:'synthetic'})
    await s.ok('createChatMemory',{scope:'private_agent',scopeId:b.agent.id,content:'PRIVATE_B_NEVER_LOAD',source:'synthetic'},{},1)
    const job=await s.ok('planRequest',{...s.planBody,colleague:a.ref})
    await s.restart()
    await s.worker(async input=>{
      const payload=JSON.parse(input.prompt)
      expect(payload.colleague.requestedAgent).toMatchObject({id:a.agent.id,profile:{personality:a.agent.profile.personality}})
      expect(payload.colleague.memories).toEqual(expect.arrayContaining([expect.objectContaining({id:memory.id,content:memory.content})]))
      expect(input.prompt).not.toContain('PRIVATE_B_NEVER_LOAD');expect(input.system).toContain('colleague profile/authorized preferences')
      return output()
    }).tick()
    expect(await s.detail(job.id)).toMatchObject({status:'draft',usage:{inputTokens:100,outputTokens:100}})
    expect((await s.call('getPlanRequest',null,{id:job.id},1)).status).toBe(404)
    expect((await s.call('getPlanRequest',null,{id:job.id})).text).not.toContain('PRIVATE_A_STYLE')
  })
  it('rejects foreign colleagues and mismatched private conversations before queuing a model call',async()=>{
    const s=await setup();await s.personal();const a=await colleague(s),b=await colleague(s,1)
    for(const ref of [b.ref,{contactId:a.agent.id,conversationId:b.ref.conversationId},{contactId:b.agent.id,conversationId:a.ref.conversationId}])
      expect((await s.call('planRequest',{...s.planBody,colleague:ref})).status).toBe(404)
    expect(s.db.prepare('SELECT count(*) n FROM execution_jobs').get()!.n).toBe(0)
  })
  it('stops queued planning when the colleague profile changes and uses the edited profile on the next turn',async()=>{
    const s=await setup();await s.personal();const a=await colleague(s)
    const job=await s.ok('planRequest',{...s.planBody,colleague:a.ref})
    const changed=await s.ok('updateContactProfile',{displayName:'My edited colleague',introduction:a.agent.profile.introduction,capabilityDescription:a.agent.profile.capabilityDescription,personality:'EDITED_STYLE: concise and direct',expectedVersion:a.agent.profile.version},{id:a.agent.id})
    let calls=0;await s.worker(async()=>{calls++;return output()}).tick();expect(calls).toBe(0)
    expect(await s.detail(job.id)).toMatchObject({status:'cancelled',failure:'AGENT_CONTEXT_CHANGED'})
    const next=await s.ok('planRequest',{...s.planBody,colleague:a.ref})
    await s.worker(async input=>{expect(JSON.parse(input.prompt).colleague.requestedAgent.displayName).toBe(changed.displayName);expect(input.prompt).toContain('EDITED_STYLE');return output()}).tick()
    expect((await s.detail(next.id)).status).toBe('draft')
  })
  it('saves an explicit planning-colleague preference through the existing chat command and fences an in-flight reply without losing usage',async()=>{
    const s=await setup();await s.personal();const a=await colleague(s)
    const job=await s.ok('planRequest',{...s.planBody,colleague:a.ref})
    const before=Number(s.db.prepare('SELECT count(*) n FROM plans').get()!.n)
    await s.worker(async()=>{
      const receipt=await s.ok('agentChatMessage',{text:'以后和我聊天，先给自己的判断，别每次列清单。'},{id:a.ref.conversationId})
      expect(receipt.turn).toMatchObject({status:'succeeded',usage:null})
      return output()
    }).tick()
    expect(await s.detail(job.id)).toMatchObject({status:'cancelled',failure:'AGENT_CONTEXT_CHANGED',usage:{inputTokens:100,outputTokens:100}})
    expect(Number(s.db.prepare('SELECT count(*) n FROM plans').get()!.n)).toBe(before)
    const memory=s.db.prepare("SELECT content FROM chat_memories WHERE scope='private_agent' AND scope_id=? AND status='active'").get(a.agent.id)
    expect(String(memory!.content)).toContain('先给自己的判断，别每次列清单')
  })
  it('continues the same draft from a copied full Plan without trusting model identity, dates or material access',async()=>{
    const s=await setup();await s.personal()
    const step={id:'comparison',title:'Synthetic comparison',goal:'Compare Metric A',deliverable:'Comparison',acceptanceCriteria:'Traceable evidence',allocation:{kind:'self'},dependencies:[],schedule,inputArtifactIds:[],budget:null}
    const counts=()=>['tasks','assignments'].map(table=>s.db.prepare('SELECT count(*) n FROM '+table).get()!.n)
    const before=counts(),first=await s.planning()
    await s.worker(async()=>({...output(),text:JSON.stringify({intent:'draft',plan:{labId:'lab_synthetic',goal:'Synthetic existing work',proposedItems:[step],unresolvedQuestions:[]}})})).tick()
    const initial=(await s.detail(first.id)).reply.plan
    const {id,ownerId:_owner,version,status:_status,createdAt:_at,conclusionRefs:_refs,...input}=initial
    const knownSchedule={...schedule,hardDeadline:{value:{kind:'date',date:'2026-11-02',timezone:'Asia/Shanghai'},source:'user',confirmed:true}}
    const edited=await s.ok('editPlan',{...input,proposedItems:[{...step,schedule:knownSchedule}],expectedVersion:version},{id})
    const second=await s.ok('planRequest',{...s.planBody,plan:{id,version:edited.version}})
    let calls=0
    await s.worker(async()=>{calls++;return {...output(),text:JSON.stringify({intent:'draft',plan:{...edited,ownerId:'other_owner',labId:'other_lab',status:'confirmed',version:999,goal:'Synthetic next step',proposedItems:[{...step,schedule:null,inputArtifactIds:['private_file']}]}})}}).tick()
    const updated=(await s.detail(second.id)).reply.plan
    expect(updated).toMatchObject({id,ownerId:initial.ownerId,labId:'lab_synthetic',status:'draft',version:edited.version+1,goal:'Synthetic next step'})
    expect(updated.proposedItems[0]).toMatchObject({id:'comparison',schedule:knownSchedule,inputArtifactIds:[]})
    expect(counts()).toEqual(before);expect(calls).toBe(1)
  })
  it('keeps the prior draft on invalid output or a late write failure, while preserving usage and private shape diagnostics',async()=>{
    const s=await setup();await s.personal();const first=await s.planning()
    await s.worker(async()=>output()).tick()
    const prior=(await s.detail(first.id)).reply.plan
    const queue=()=>s.ok('planRequest',{...s.planBody,plan:{id:prior.id,version:prior.version}})
    const bad=await queue()
    await s.worker(async()=>({...output(),text:JSON.stringify({intent:'draft',plan:{proposedItems:[],unresolvedQuestions:[],PRIVATE_FIELD:'PRIVATE_RETURNED_CONTENT'}})})).tick()
    expect(await s.detail(bad.id)).toMatchObject({status:'failed',failure:'INVALID_MODEL_OUTPUT',usage:{inputTokens:100,outputTokens:100}})
    expect(await s.ok('getPlan',null,{id:prior.id})).toEqual(prior)
    const failed=JSON.parse(String(s.db.prepare('SELECT result_json FROM execution_attempts WHERE job_id=?').get(bad.id)!.result_json))
    expect(failed).toMatchObject({text:'',planningOutputDiagnostic:{stage:'parsing',category:'schema'}})
    expect(JSON.stringify(failed)).not.toMatch(/PRIVATE_|Synthetic owned draft/)
    const late=await queue()
    s.db.exec(`CREATE TRIGGER synthetic_planning_write_failure BEFORE UPDATE ON execution_jobs WHEN NEW.id='${late.id}' AND json_extract(NEW.document,'$.status')='draft' BEGIN SELECT RAISE(ABORT,'synthetic_write_failure'); END`)
    await s.worker(async()=>({...output(),text:JSON.stringify({intent:'draft',plan:{...prior,goal:'Must roll back this change'}})})).tick()
    expect(await s.detail(late.id)).toMatchObject({status:'failed',failure:'PLANNING_SAVE_FAILED',usage:{inputTokens:100,outputTokens:100}})
    expect(await s.ok('getPlan',null,{id:prior.id})).toEqual(prior)
    const stored=JSON.parse(String(s.db.prepare('SELECT result_json FROM execution_attempts WHERE job_id=?').get(late.id)!.result_json))
    expect(stored).toMatchObject({text:'',planningOutputDiagnostic:{stage:'persistence',category:'persistence'}})
    expect(JSON.stringify(stored)).not.toContain('Must roll back')
  })
  it('uses each requester default provider and key with lab AI disabled, persists binding through restart and keeps receipts secret-free',async()=>{
    const s=await setup();await s.personal();await s.personal(1,'doubao','doubao-test')
    const key=randomUUID(),a=await s.planning(0,key),b=await s.planning(1)
    expect((await s.planning(0,key)).id).toBe(a.id)
    const binding=JSON.parse(String(s.db.prepare('SELECT request_json FROM execution_jobs WHERE id=?').get(a.id)!.request_json)).modelBinding
    expect(binding).toMatchObject({source:'personal',provider:'qwen',model:'qwen-test'})
    await s.restart();const called:string[]=[]
    const w=s.worker(async(input,_signal,credential)=>{called.push(input.provider!);expect(credential.apiKey).toBe(input.provider==='qwen'?'synthetic-owned-key-0':'synthetic-owned-key-1');expect(input.model).toBe(input.provider==='qwen'?'qwen-test':'doubao-test');return output()})
    await w.tick();await w.tick();expect(called.sort()).toEqual(['doubao','qwen'])
    expect(await s.detail(a.id)).toMatchObject({status:'draft',usage:{inputTokens:100,outputTokens:100}});expect(await s.detail(b.id,1)).toMatchObject({status:'draft'})
    expect((await s.call('getPlanRequest',null,{id:a.id},1)).status).toBe(404)
    const stored=s.db.prepare('SELECT request_json,document FROM execution_jobs').all().concat(s.db.prepare('SELECT request_json,result_json FROM execution_attempts').all())
    expect(JSON.stringify(stored)).not.toContain('synthetic-owned-key-');expect((await s.call('getPlanRequest',null,{id:a.id})).text).not.toContain('modelBinding')
  })
  it('allows explicit manager legacy compatibility but requires ordinary members own model and never falls back after clearing it',async()=>{
    const s=await setup();await s.lab()
    expect((await s.call('planRequest',s.planBody,{},1)).value.error.code).toBe('MODEL_UNAVAILABLE')
    const old=await s.planning();expect(JSON.parse(String(s.db.prepare('SELECT request_json FROM execution_jobs WHERE id=?').get(old.id)!.request_json)).modelBinding.source).toBe('legacy_lab')
    await s.worker(async(input,_signal,credential)=>{expect(input.provider).toBe('deepseek');expect(credential.apiKey).toBe('sk-synthetic-legacy-manager-key');return output()}).tick()
    expect((await s.detail(old.id)).status).toBe('draft')
    await s.personal(1);const settings=await s.ok('personalModels',null,{},1)
    await s.ok('defaultPersonalModel',{expectedVersion:settings.version,configurationId:null},{},1)
    expect((await s.call('planRequest',s.planBody,{},1)).value.error.code).toBe('MODEL_UNAVAILABLE')
    // Facts never require a model and do not call a supplier.
    expect(await s.ok('planRequest',{...s.planBody,intent:'progress'},{},1)).toMatchObject({status:'ready',reply:{origin:'service_facts'}})
  })
  it('fences queued default changes and disabled configurations before any supplier call',async()=>{
    const s=await setup();const model=await s.personal(),queued=await s.planning()
    const changed=await s.ok('updatePersonalModel',{name:model.name,provider:model.provider,model:'qwen-next',enabled:true,expectedVersion:model.version},{id:model.id})
    let calls=0;expect(await s.worker(async()=>{calls++;return output()}).tick()).toBe(false);expect(calls).toBe(0)
    expect(await s.detail(queued.id)).toMatchObject({status:'cancelled',failure:'MODEL_CONFIGURATION_CHANGED'})
    const next=await s.planning()
    await s.ok('updatePersonalModel',{name:changed.name,provider:changed.provider,model:changed.model,enabled:false,expectedVersion:changed.version},{id:changed.id})
    expect(await s.worker(async()=>{calls++;return output()}).tick()).toBe(false);expect(calls).toBe(0)
    expect(await s.detail(next.id)).toMatchObject({status:'cancelled',failure:'MODEL_UNAVAILABLE'})
  })
  it('aborts running planning when its model changes, retains accounting and discards late content',async()=>{
    const s=await setup(),model=await s.personal(),job=await s.planning()
    let observedAbort=false
    await s.worker(async(_input,signal)=>{
      await s.ok('updatePersonalModel',{name:model.name,provider:model.provider,model:'qwen-next',enabled:true,expectedVersion:model.version},{id:model.id})
      await new Promise<void>(resolve=>{if(signal.aborted)resolve();else signal.addEventListener('abort',()=>resolve(),{once:true})});observedAbort=signal.aborted
      return output()
    }).tick()
    expect(observedAbort).toBe(true);expect(await s.detail(job.id)).toMatchObject({status:'cancelled',failure:'MODEL_CONFIGURATION_CHANGED',planId:null,usage:{inputTokens:100,outputTokens:100}})
    expect(s.db.prepare('SELECT count(*) n FROM plans').get()!.n).toBe(0)
    expect(s.db.prepare('SELECT count(*) n FROM execution_attempts WHERE job_id=?').get(job.id)!.n).toBe(1)
  })
  it('retains the lab path for historical unbound queued jobs while current public task execution stays on lab credentials',async()=>{
    const s=await setup();await s.lab();const historical=await s.planning()
    const row=s.db.prepare('SELECT request_json FROM execution_jobs WHERE id=?').get(historical.id)!,request=JSON.parse(String(row.request_json));delete request.modelBinding;s.db.prepare('UPDATE execution_jobs SET request_json=? WHERE id=?').run(JSON.stringify(request),historical.id)
    await s.personal()
    await s.worker(async(input,_signal,credential)=>{expect(input.model).toBe('deepseek-flash');expect(credential.apiKey).toBe('sk-synthetic-legacy-manager-key');return output()}).tick()
    expect((await s.detail(historical.id)).status).toBe('draft')
    s.db.prepare("INSERT INTO public_capabilities VALUES (?,?,1,1,'member_A')").run('lab_synthetic','text-evidence-checklist')
    const draft=await s.ok('createPlan',{labId:'lab_synthetic',goal:'Synthetic execution goal',proposedItems:[{id:'one',title:'Synthetic checklist',goal:'Check Metric A',deliverable:'Checked checklist',acceptanceCriteria:'Quote supplied metric',allocation:{kind:'self'},dependencies:[],schedule,inputArtifactIds:[],budget:null}],unresolvedQuestions:[]})
    const confirmed=await s.ok('confirmPlan',{expectedVersion:1},{id:draft.id}),id=confirmed.taskIds[0]
    const artifact=await s.ok('upload',{taskId:id,expectedVersion:1,filename:'synthetic.txt',mediaType:'text/plain',contentBase64:Buffer.from('Metric A: 12 samples.').toString('base64')})
    const task=(await s.ok('task',null,{id})).task,run=await s.ok('run',{expectedVersion:task.version,capability:{id:'text-evidence-checklist',version:1,visibility:'lab_public'},budget,inputArtifactIds:[artifact.id]},{id})
    await s.worker(async(input,_signal,credential)=>{expect(input.provider).toBeUndefined();expect(input.model).toBe('deepseek-flash');expect(credential.apiKey).toBe('sk-synthetic-legacy-manager-key');return {text:JSON.stringify({title:'Synthetic checklist',items:[{requirement:'Metric A count',assessment:'supported_by_input',citations:[{artifactId:artifact.id,quote:'Metric A: 12 samples.'}],gap:null}],limitations:['Only supplied text checked.']}),failure:null,inputTokens:100,outputTokens:100,elapsedMs:10}}).tick()
    expect(await s.ok('getRun',null,{id:run.id})).toMatchObject({status:'succeeded'})
  })
  it('enforces the existing remaining budget before personal model dispatch',async()=>{
    const s=await setup();await s.personal();const job=await s.ok('planRequest',{...s.planBody,budget:{maxTokens:1,maxSeconds:30}})
    let calls=0;expect(await s.worker(async()=>{calls++;return output()}).tick()).toBe(false);expect(calls).toBe(0)
    expect(await s.detail(job.id)).toMatchObject({status:'failed',failure:'BUDGET_EXCEEDED'})
  })
})
