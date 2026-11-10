import { randomUUID } from 'node:crypto'
import { WorkRule, PLATFORM_WORK_RULE, type WorkContext, type RequestFor, type workContextRoutes } from '@research-agent-platform/contracts'
import type { ChatService } from './chat.js'
import { personalWork } from './workspace.js'
import { isLabManager } from './invite-management.js'
import { fail } from './errors.js'
import { assertAllowed } from './subjects.js'
import { hash } from './auth.js'
import { activePersonalRuleBytes, activeRuleBytes, entryBytes } from './constitution-context.js'
import { ruleBudget } from '@research-agent-platform/constitution'

/** 生效规则会整体进入规划上下文，预算在写入侧挡住，装配侧的抛错只作兜底。 */
function assertRuleBudget(db:ChatService['db'],labId:string,record:WorkRule){
  if(record.kind!=='rule'||record.status!=='active')return
  const projects=record.scope==='project'?[record.scopeId]:[undefined,...db.prepare("SELECT DISTINCT scope_id FROM work_context_records WHERE lab_id=? AND scope='project'").all(labId).map(r=>String(r.scope_id))]
  for(const project of projects)if(activeRuleBytes(db,labId,record.id,project)+entryBytes('lab',record.title,record.version,record.content,record.id)>ruleBudget)fail('PAYLOAD_TOO_LARGE')
}

type Command=keyof typeof workContextRoutes
export function runWorkContext(s:ChatService,name:Command,req:RequestFor<Command>) {
 // Lab rules are edited without a task, so they have their own two commands.
 if(name==='labWorkRules'||name==='saveLabWorkRule')
  return runLabWorkRule(s,name,req as RequestFor<'labWorkRules'|'saveLabWorkRule'>)
 if(name==='personalWorkRules'||name==='savePersonalWorkRule')
  return runPersonalWorkRule(s,name,req as RequestFor<'personalWorkRules'|'savePersonalWorkRule'>)
 const {kind,id}=req.params, c=s.c, actor=c.actor.id
 let scopes:WorkContext['scopes']=[], privateMemoryAllowed=false
 if(kind==='research'){
  const task=c.task(id), plan=s.db.prepare('SELECT owner_id FROM plans WHERE id=?').get(task.planId)
  scopes=[{scope:'lab',id:c.labId,canPublish:isLabManager(s.db,c.actor)},{scope:'project',id:task.planId,canPublish:plan?.owner_id===actor}]
 } else {
  const task=personalWork(s,id)
  if(task.summaryOnly)fail('FORBIDDEN')
  // A shared personal task is still a shared context. Never inject its owner's private memories.
  const row=s.db.prepare('SELECT owner_id FROM personal_work_tasks WHERE id=?').get(id)!
  privateMemoryAllowed=row.owner_id===actor && !s.db.prepare("SELECT 1 FROM personal_work_participants p JOIN chat_contacts c ON c.id=p.contact_id WHERE p.task_id=? AND c.owner_id!=? AND p.status IN ('invited','accepted')").get(id,actor)
 }
 const scopeFor=(scope:string,scopeId:string)=>scopes.find(x=>x.scope===scope&&x.id===scopeId)
 const visible=(r:WorkRule)=>{
  if(!scopeFor(r.scope,r.scopeId))return false
  // A memory always cites a task; a lab rule managed outside a task cites none.
  if(r.kind==='memory'){if(!r.sourceTaskId)return false;try{c.task(r.sourceTaskId)}catch{return false}}
  return true
 }
 const project=(r:WorkRule):WorkRule=>({...r,allowedActions:r.status==='revoked'?[]:scopeFor(r.scope,r.scopeId)?.canPublish?['revise','confirm','revoke']:r.status==='candidate'&&r.authorId===actor?['revise','revoke']:[]})
 const get=(recordId:string)=>{
  const row=s.db.prepare('SELECT document FROM work_context_records WHERE id=? AND lab_id=?').get(recordId,c.labId)
  if(!row)fail('NOT_FOUND')
  const r=WorkRule.parse(JSON.parse(String(row.document)))
  if(!visible(r))fail('NOT_FOUND')
  return project(r)
 }
 if(name==='workContext'){
  const records=scopes.flatMap(scope=>s.db.prepare('SELECT document FROM work_context_records WHERE lab_id=? AND scope=? AND scope_id=? ORDER BY id').all(c.labId,scope.scope,scope.id).map(row=>WorkRule.parse(JSON.parse(String(row.document))))).filter(visible).map(project)
  const personalRules=kind==='research'||privateMemoryAllowed?s.db.prepare('SELECT document FROM personal_work_rules WHERE member_id=? ORDER BY id').all(actor).map(row=>WorkRule.parse(JSON.parse(String(row.document)))).filter(r=>r.kind==='rule'&&r.status==='active'):[]
  return {data:{platform:PLATFORM_WORK_RULE,scopes,records,privateMemoryAllowed,personalRules}}
 }
 if(name==='workRuleHistory'){
  const recordId=(req.params as RequestFor<'workRuleHistory'>['params']).recordId
  get(recordId)
  return {data:s.db.prepare('SELECT document FROM work_context_revisions WHERE record_id=? ORDER BY version DESC').all(recordId).map(row=>({...WorkRule.parse(JSON.parse(String(row.document))),allowedActions:[]}))}
 }
 const b=(req as RequestFor<'saveWorkRule'>).body, scope=scopes.find(x=>x.scope===b.scope)
 if(!scope || (b.kind==='memory'&&b.scope!=='project'))fail('FORBIDDEN')
 const old=b.recordId?get(b.recordId):null
 if(old&&(old.scope!==b.scope||old.kind!==b.kind))fail('VALIDATION_ERROR')
 if(b.kind==='link')fail('VALIDATION_ERROR') // reusable methods use the lab publication/review route
 // Authorize before replay: revoked membership must not expose a saved response.
 const commandKey=req.headers['Idempotency-Key']!, digest=hash(JSON.stringify(b)), resource=kind+':'+id
 const cached=s.db.prepare('SELECT request_hash,response_json FROM idempotency_results WHERE actor_id=? AND command=? AND resource_id=? AND key=?').get(actor,name,resource,commandKey)
 if(cached){if(cached.request_hash!==digest)fail('IDEMPOTENCY_CONFLICT');const response=JSON.parse(String(cached.response_json));get(response.data.id);return response}
 if(old){
  c.checkVersion(old.version,b.expectedVersion)
  if(old.status==='revoked')fail('INVALID_STATE')
  if(!old.allowedActions.includes(b.action==='save'?'revise':b.action))fail('FORBIDDEN')
 }else if(b.expectedVersion!==0||b.action!=='save')fail('VALIDATION_ERROR')
 if(old&&old.version>=100)fail('RATE_LIMITED')
 if(!old&&Number(s.db.prepare('SELECT count(*) n FROM work_context_records WHERE lab_id=? AND scope=? AND scope_id=?').get(c.labId,scope.scope,scope.id)!.n)>=40)fail('RATE_LIMITED')
 const now=new Date().toISOString()
 const value:WorkRule={...b,id:old?.id??randomUUID(),scopeId:scope.id,sourceTaskId:old?.sourceTaskId??id,
  authorId:actor,authorName:c.member(actor).displayName,status:b.action==='revoke'?'revoked':b.action==='confirm'?'active':scope.canPublish?'active':'candidate',version:(old?.version??0)+1,updatedAt:now,allowedActions:[]}
 // Decision buttons cannot silently edit the proposed content.
 if(old&&b.action!=='save'){value.title=old.title;value.content=old.content}
 const {recordId:_recordId,expectedVersion:_version,action:_action,...clean}=value as WorkRule & typeof b
 const record=WorkRule.parse(clean), document=JSON.stringify(record)
 assertRuleBudget(s.db,c.labId,record)
 s.db.prepare('INSERT INTO work_context_records VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document').run(record.id,c.labId,scope.scope,scope.id,document)
 s.db.prepare('INSERT INTO work_context_revisions VALUES(?,?,?)').run(record.id,record.version,document)
 const result={data:project(record)}
 s.db.prepare('INSERT INTO idempotency_results(actor_id,command,resource_id,key,request_hash,response_json,http_status,created_at) VALUES(?,?,?,?,?,?,?,?)').run(actor,name,resource,commandKey,digest,JSON.stringify(result),200,now)
 return result
}

/**
 * Lab rules live outside any task: members read them, the lab manager publishes
 * and confirms, everyone else stages a candidate. History stays immutable.
 */
function runLabWorkRule(s:ChatService,name:'labWorkRules'|'saveLabWorkRule',req:RequestFor<'labWorkRules'|'saveLabWorkRule'>){
 const c=s.c, actor=c.actor.id, canPublish=isLabManager(s.db,c.actor)
 // 组内链路由承接人提交、派发人批准；规则仍由负责人批准。
 const dispatched=new Set(s.db.prepare("SELECT id FROM tasks WHERE lab_id=? AND initiator_id=?").all(c.labId,actor).map(row=>String(row.id)))
 const approves=(r:WorkRule)=>canPublish||(r.kind==='link'&&!!r.sourceTaskId&&dispatched.has(r.sourceTaskId))
 const project=(r:WorkRule):WorkRule=>({...r,allowedActions:r.status==='revoked'?[]:approves(r)?['revise','confirm','revoke']:r.status==='candidate'&&r.authorId===actor?['revise','revoke']:[]})
 const get=(recordId:string)=>{
  const row=s.db.prepare("SELECT document FROM work_context_records WHERE id=? AND lab_id=? AND scope='lab'").get(recordId,c.labId)
  if(!row)fail('NOT_FOUND')
  const r=WorkRule.parse(JSON.parse(String(row.document)))
  if(r.scopeId!==c.labId)fail('NOT_FOUND')
  return project(r)
 }
 if(name==='labWorkRules')
  return {data:{platform:PLATFORM_WORK_RULE,canPublish,records:s.db.prepare("SELECT document FROM work_context_records WHERE lab_id=? AND scope='lab' AND scope_id=? ORDER BY id").all(c.labId,c.labId).map(row=>WorkRule.parse(JSON.parse(String(row.document)))).map(project)}}
 const b=(req as RequestFor<'saveLabWorkRule'>).body
 // Authorize before replay: a revoked membership must not read a saved response.
 const commandKey=req.headers['Idempotency-Key']!, digest=hash(JSON.stringify(b)), resource='lab'
 const cached=s.db.prepare('SELECT request_hash,response_json FROM idempotency_results WHERE actor_id=? AND command=? AND resource_id=? AND key=?').get(actor,name,resource,commandKey)
 if(cached){if(cached.request_hash!==digest)fail('IDEMPOTENCY_CONFLICT');const response=JSON.parse(String(cached.response_json));get(response.data.id);return response}
 const old=b.recordId?get(b.recordId):null
 if(old&&old.kind!==b.kind)fail('VALIDATION_ERROR')
 if(old){
  c.checkVersion(old.version,b.expectedVersion)
  if(old.status==='revoked')fail('INVALID_STATE')
  if(!old.allowedActions.includes(b.action==='save'?'revise':b.action))fail('FORBIDDEN')
 }else if(b.expectedVersion!==0||b.action!=='save')fail('VALIDATION_ERROR')
 if(old&&old.version>=100)fail('RATE_LIMITED')
 if(!old&&Number(s.db.prepare("SELECT count(*) n FROM work_context_records WHERE lab_id=? AND scope='lab' AND scope_id=?").get(c.labId,c.labId)!.n)>=40)fail('RATE_LIMITED')
 // 批准类动作走统一入口：负责人，或该链路来源任务的派发人。
 if(b.action==='confirm'){
  const sourceTaskId=old?.sourceTaskId??null
  assertAllowed('lab',b.kind,{member:true,manager:canPublish,initiator:sourceTaskId!==null&&dispatched.has(sourceTaskId)},'approve')
 }
 // 只有提交人能绑定来源任务：链路必须以自己承接的任务为依据。
 if(b.kind==='link'&&!old&&!b.sourceTaskId)fail('VALIDATION_ERROR')
 if(old&&b.sourceTaskId&&b.sourceTaskId!==old.sourceTaskId)fail('VALIDATION_ERROR')
 if(b.action==='save'&&b.sourceTaskId&&(!old||b.sourceTaskId!==old.sourceTaskId)){
  const source=c.task(b.sourceTaskId)
  if(source.leadId!==actor)fail('FORBIDDEN')
  if(b.kind==='link'&&source.status!=='completed')fail('INVALID_STATE')
 }
 const now=new Date().toISOString()
 const value:WorkRule={...b,id:old?.id??randomUUID(),scopeId:c.labId,sourceTaskId:b.sourceTaskId??old?.sourceTaskId??null,
  authorId:actor,authorName:c.member(actor).displayName,status:b.action==='revoke'?'revoked':b.action==='confirm'?'active':canPublish?'active':'candidate',version:(old?.version??0)+1,updatedAt:now,allowedActions:[]}
 // 变更动作只改状态：标题、正文、类型与来源任务都保持原样。
 if(old&&b.action!=='save'){value.title=old.title;value.content=old.content;value.kind=old.kind;value.sourceTaskId=old.sourceTaskId}
 const {recordId:_recordId,expectedVersion:_version,action:_action,...clean}=value as WorkRule & typeof b
 const record=WorkRule.parse(clean), document=JSON.stringify(record)
 assertRuleBudget(s.db,c.labId,record)
 s.db.prepare('INSERT INTO work_context_records VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document').run(record.id,c.labId,'lab',c.labId,document)
 s.db.prepare('INSERT INTO work_context_revisions VALUES(?,?,?)').run(record.id,record.version,document)
 const result={data:project(record)}
 s.db.prepare('INSERT INTO idempotency_results(actor_id,command,resource_id,key,request_hash,response_json,http_status,created_at) VALUES(?,?,?,?,?,?,?,?)').run(actor,name,resource,commandKey,digest,JSON.stringify(result),200,now)
 return result
}

/**
 * 个人层规则：只属于本人，由本人自己批准，不经负责人。
 * 与课题组规则同形、同预算，但存在独立表里，课题组查询读不到。
 */
function runPersonalWorkRule(s:ChatService,name:'personalWorkRules'|'savePersonalWorkRule',req:RequestFor<'personalWorkRules'|'savePersonalWorkRule'>){
 const c=s.c, actor=c.actor.id
 const project=(r:WorkRule):WorkRule=>({...r,allowedActions:r.status==='revoked'?[]:['revise','confirm','revoke']})
 // 私有资产的归属判定走统一入口：别人问到同一条规则时按不存在处理，不暴露存在性。
 const get=(recordId:string)=>{
  const row=s.db.prepare('SELECT member_id, document FROM personal_work_rules WHERE id=?').get(recordId)
  if(!row)fail('NOT_FOUND')
  assertAllowed('personal','rule',{owner:String(row.member_id)===actor},'write')
  return project(WorkRule.parse(JSON.parse(String(row.document))))
 }
 if(name==='personalWorkRules')
  return {data:{platform:PLATFORM_WORK_RULE,canPublish:true,records:s.db.prepare('SELECT document FROM personal_work_rules WHERE member_id=? ORDER BY id').all(actor).map(row=>WorkRule.parse(JSON.parse(String(row.document)))).map(project)}}
 const b=(req as RequestFor<'savePersonalWorkRule'>).body
 const commandKey=req.headers['Idempotency-Key']!, digest=hash(JSON.stringify(b)), resource='personal'
 const cached=s.db.prepare('SELECT request_hash,response_json FROM idempotency_results WHERE actor_id=? AND command=? AND resource_id=? AND key=?').get(actor,name,resource,commandKey)
 if(cached){if(cached.request_hash!==digest)fail('IDEMPOTENCY_CONFLICT');const response=JSON.parse(String(cached.response_json));get(response.data.id);return response}
 const old=b.recordId?get(b.recordId):null
 if(old){
  c.checkVersion(old.version,b.expectedVersion)
  if(old.status==='revoked')fail('INVALID_STATE')
 }else if(b.expectedVersion!==0||b.action!=='save')fail('VALIDATION_ERROR')
 if(old&&old.version>=100)fail('RATE_LIMITED')
 if(!old&&Number(s.db.prepare('SELECT count(*) n FROM personal_work_rules WHERE member_id=?').get(actor)!.n)>=40)fail('RATE_LIMITED')
 const now=new Date().toISOString()
 const value:WorkRule={...b,scope:'personal',id:old?.id??randomUUID(),scopeId:actor,sourceTaskId:null,
  authorId:actor,authorName:c.member(actor).displayName,status:b.action==='revoke'?'revoked':'active',version:(old?.version??0)+1,updatedAt:now,allowedActions:[]}
 if(old&&b.action!=='save'){value.title=old.title;value.content=old.content;value.kind=old.kind}
 const {recordId:_recordId,expectedVersion:_version,action:_action,...clean}=value as WorkRule & typeof b
 const record=WorkRule.parse(clean), document=JSON.stringify(record)
 if(record.kind==='rule'&&record.status==='active'&&activePersonalRuleBytes(s.db,actor,record.id)+entryBytes('personal',record.title,record.version,record.content,record.id)>ruleBudget)fail('PAYLOAD_TOO_LARGE')
 s.db.prepare('INSERT INTO personal_work_rules VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document').run(record.id,actor,document)
 s.db.prepare('INSERT INTO personal_work_rule_revisions VALUES(?,?,?)').run(record.id,record.version,document)
 const personalResult={data:project(record)}
 s.db.prepare('INSERT INTO idempotency_results(actor_id,command,resource_id,key,request_hash,response_json,http_status,created_at) VALUES(?,?,?,?,?,?,?,?)').run(actor,name,resource,commandKey,digest,JSON.stringify(personalResult),200,now)
 return personalResult
}
