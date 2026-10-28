import { randomUUID } from 'node:crypto'
import { TeamWorkItem, WorkExecution, type RequestFor, type teamWorkRoutes } from '@research-agent-platform/contracts'
import type { ChatService } from './chat.js'
import { personalWork } from './workspace.js'
import { isMessageRetracted, linkMessageReply } from './chat-message-actions.js'
import { hash } from './auth.js'
import { fail } from './errors.js'

type Command = keyof typeof teamWorkRoutes
type TeamRow = {id:string;conversation_id:string;source_message_id:string;task_id:string;agent_id:string;owner_id:string;document:string}
const decode = (v:unknown) => JSON.parse(String(v))
const active = (phase:string) => ['claimed','running','uncertain'].includes(phase)
const labels:Record<string,string> = {awaiting_acceptance:'待负责人承接',ready:'已承接，等待设备开始',in_progress:'任务进行中',blocked:'任务有阻碍',in_review:'成果已提交，待验收',completed:'成果已验收',cancelled:'任务已取消',claimed:'设备已领取',running:'本机正在执行',uncertain:'设备中断，结果待核对',finished:'本轮结束，待核对并提交成果',failed:'本轮失败，待处理',stopped:'本轮已停止',unavailable:'群成员或来源权限已变化'}

function lastExecution(s:ChatService,kind:string,id:string):WorkExecution|null {
  const row=s.db.prepare('SELECT document FROM work_executions WHERE kind=? AND task_id=? ORDER BY rowid DESC LIMIT 1').get(kind,id)
  if(!row)return null
  const value=WorkExecution.parse(decode(row.document)),now=s.clock()
  if(['claimed','running'].includes(value.phase)&&(now-Date.parse(value.heartbeatAt)>30000||now>Date.parse(value.deadlineAt))){
    value.phase='uncertain';s.db.prepare('UPDATE work_executions SET phase=?,document=? WHERE id=?').run(value.phase,JSON.stringify(value),value.id)
  }
  return value
}
function teamAuthority(s:ChatService,row:TeamRow) {
  const group=s.conversation(row.conversation_id,false)
  if(group.kind!=='group'||isMessageRetracted(s,row.source_message_id))fail('FORBIDDEN')
  const agent=s.joinedAgent(group,row.agent_id)
  if(agent.identity.kind!=='personal_agent'||agent.agentRuntime||agent.identity.ownerMemberId!==row.owner_id)fail('FORBIDDEN')
  if(!group.members.some(m=>m.contactId===s.human(row.owner_id).id&&m.status==='joined'))fail('FORBIDDEN')
  s.c.member(row.owner_id)
  return {group,agent}
}
function teamItem(s:ChatService,row:TeamRow,notify=true):TeamWorkItem {
  const doc=decode(row.document),task=s.db.prepare('SELECT status,version FROM tasks WHERE id=?').get(row.task_id)!
  const execution=lastExecution(s,'research',row.task_id)
  let status=String(task.status),canOpen=false
  try {s.c.taskRow(row.task_id);canOpen=true}catch{/* Group membership is not task access. */}
  try {teamAuthority(s,row)}catch{status='unavailable'}
  if(!['unavailable','in_review','completed','cancelled','awaiting_acceptance','blocked','changes_requested'].includes(status)&&execution)status=execution.phase
  const deviceOnline=!!s.db.prepare('SELECT 1 FROM work_devices WHERE actor_id=? AND seen_at>?').get(row.owner_id,new Date(s.clock()-45000).toISOString())
  if(notify&&doc.notified!==status){
    const message=s.message(row.conversation_id,{senderContactId:null,origin:'service',text:`${doc.agentName}（${doc.ownerName}的助手） · ${doc.title}：${labels[status]||status}。`,mentions:[],resources:status==='unavailable'?[]:[{kind:'task',ref:{id:row.task_id,version:Number(task.version)}}],actionIds:[],turnId:null})
    if(!isMessageRetracted(s,row.source_message_id))linkMessageReply(s,message.id,row.source_message_id)
    doc.notified=status;s.db.prepare('UPDATE team_work SET document=? WHERE id=?').run(JSON.stringify(doc),row.id)
  }
  return TeamWorkItem.parse({id:row.id,conversationId:row.conversation_id,sourceMessageId:row.source_message_id,taskId:row.task_id,title:doc.title,agentContactId:row.agent_id,agentName:doc.agentName,ownerId:row.owner_id,ownerName:doc.ownerName,status,deviceOnline,canOpen,execution})
}
function authorizeTask(s:ChatService,kind:string,id:string,write=false) {
  const team=kind==='research'?s.db.prepare('SELECT * FROM team_work WHERE task_id=?').get(id) as TeamRow|undefined:undefined
  if(kind==='research'){
    if(write){const task=s.c.actions(s.c.task(id));if(!task.allowedActions.includes('submit'))fail('FORBIDDEN')}
    else s.c.taskRow(id)
  }else{
    const task=personalWork(s,id)
    if(task.summaryOnly||write&&!task.allowedActions.some(a=>a==='run'||a==='submit'))fail('FORBIDDEN')
  }
  if(team){teamAuthority(s,team);if(write&&team.owner_id!==s.c.actor.id)fail('FORBIDDEN')}
  return team
}

export function runTeamWork(s:ChatService,name:Command,input:RequestFor<Command>):unknown {
  const req=input as any,actor=s.c.actor.id,now=new Date(s.clock()).toISOString()
  if(name==='workDevice'){
    // A heartbeat conveys presence only. It grants no file or task authority.
    s.db.prepare('DELETE FROM work_devices WHERE seen_at<?').run(new Date(s.clock()-86400000).toISOString())
    s.db.prepare('INSERT INTO work_devices VALUES(?,?,?) ON CONFLICT(actor_id,device_id) DO UPDATE SET seen_at=excluded.seen_at').run(actor,req.body.deviceId,now)
    return {data:{seenAt:now}}
  }
  const {id,kind}=req.params
  if(name==='teamWork'||name==='createTeamWork'){
    const group=s.conversation(id,false);if(group.kind!=='group')fail('FORBIDDEN')
    if(name==='teamWork')return {data:s.db.prepare('SELECT * FROM team_work WHERE conversation_id=? ORDER BY rowid DESC LIMIT 100').all(id).map(row=>teamItem(s,row as TeamRow))}
    const b=req.body as RequestFor<'createTeamWork'>['body'],source=s.projectedMessage(b.sourceMessageId)
    if(source.conversationId!==id||source.origin==='service'||isMessageRetracted(s,source.id))fail('FORBIDDEN')
    const resource=id,key=req.headers['Idempotency-Key'],digest=hash(JSON.stringify(b))
    const cached=s.db.prepare('SELECT request_hash,response_json FROM idempotency_results WHERE actor_id=? AND command=? AND resource_id=? AND key=?').get(actor,name,resource,key)
    if(cached){if(cached.request_hash!==digest)fail('IDEMPOTENCY_CONFLICT');return {data:decode(cached.response_json).ids.map((id:string)=>teamItem(s,s.db.prepare('SELECT * FROM team_work WHERE id=?').get(id) as TeamRow))}}
    s.c.checkVersion(group.version,b.expectedConversationVersion)
    if(new Set(b.assignments.map(a=>a.agentContactId)).size!==b.assignments.length)fail('VALIDATION_ERROR')
    if(Number(s.db.prepare('SELECT count(*) n FROM team_work WHERE conversation_id=?').get(id)!.n)+b.assignments.length>100)fail('RATE_LIMITED')
    const assignments=b.assignments.map(a=>{
      const agent=s.joinedAgent(group,a.agentContactId)
      if(agent.identity.kind!=='personal_agent'||agent.agentRuntime)fail('FORBIDDEN')
      const ownerId=agent.identity.ownerMemberId,owner=s.c.member(ownerId)
      if(!group.members.some(m=>m.contactId===s.human(ownerId).id&&m.status==='joined'))fail('FORBIDDEN')
      if(s.db.prepare('SELECT 1 FROM team_work WHERE conversation_id=? AND source_message_id=? AND agent_id=?').get(id,source.id,agent.id))fail('ALREADY_CLAIMED')
      return {...a,ownerId,ownerName:owner.displayName,agentName:agent.displayName}
    })
    const schedule={suggested:null,hardDeadline:null,committed:null,estimatedHumanHours:null,checkpoint:null}
    const plan=(s.c.handlers.createPlan({body:{labId:s.c.labId,goal:'群内文献整理协作',unresolvedQuestions:[],proposedItems:assignments.map((a,i)=>({id:'item_'+i,title:a.title,goal:a.goal,deliverable:'可核对来源的文献整理成果',acceptanceCriteria:'列明原始来源、证据及未核实事项，由发起人审阅后验收。',allocation:a.ownerId===actor?{kind:'self' as const}:{kind:'invitation' as const,memberId:a.ownerId},dependencies:[],schedule,inputArtifactIds:[],budget:null}))},params:{},query:{},headers:{}}) as any).data
    const taskIds=(s.c.handlers.confirmPlan({params:{id:plan.id},query:{},headers:{},body:{expectedVersion:plan.version}}) as any).data.taskIds as string[]
    const raw=s.rawConversation(id);raw.taskIds=[...raw.taskIds,...taskIds];if(raw.taskIds.length>100)fail('RATE_LIMITED');raw.version++;s.saveConversation(raw)
    const rows=assignments.map((a,i)=>{
      const row:TeamRow={id:randomUUID(),conversation_id:id,source_message_id:source.id,task_id:taskIds[i]!,agent_id:a.agentContactId,owner_id:a.ownerId,document:JSON.stringify({title:a.title,agentName:a.agentName,ownerName:a.ownerName})}
      s.db.prepare('INSERT INTO team_work VALUES(?,?,?,?,?,?,?)').run(row.id,id,source.id,row.task_id,row.agent_id,row.owner_id,row.document);return row
    })
    s.db.prepare('INSERT INTO idempotency_results(actor_id,command,resource_id,key,request_hash,response_json,http_status,created_at) VALUES(?,?,?,?,?,?,?,?)').run(actor,name,resource,key,digest,JSON.stringify({ids:rows.map(r=>r.id)}),200,now)
    return {data:rows.map(r=>teamItem(s,r))}
  }
  // Reporting an old stopped process is allowed after execution authority was revoked,
  // but only by its recorded actor/device; it cannot restart or expose task contents.
  if(name==='reportWorkExecution'){
    const b=req.body as RequestFor<'reportWorkExecution'>['body']
    const row=s.db.prepare('SELECT document FROM work_executions WHERE id=? AND kind=? AND task_id=? AND actor_id=? AND device_id=? AND request_id=?').get(b.executionId,kind,id,actor,b.deviceId,b.requestId)
    if(!row)fail('NOT_FOUND')
    const value=WorkExecution.parse(decode(row.document))
    if(!active(value.phase)){if(value.phase!==b.phase)fail('INVALID_STATE');return {data:value}}
    if(b.phase==='running'){
      authorizeTask(s,kind,id,true)
      if(s.clock()>Date.parse(value.deadlineAt))fail('INVALID_STATE')
    }
    value.phase=b.phase;value.heartbeatAt=now
    s.db.prepare('UPDATE work_executions SET phase=?,document=? WHERE id=?').run(value.phase,JSON.stringify(value),value.id)
    const team=s.db.prepare('SELECT * FROM team_work WHERE task_id=?').get(id) as TeamRow|undefined
    if(team){try{s.conversation(team.conversation_id,false);teamItem(s,team)}catch{/* No status publication into a revoked group. */}}
    return {data:value}
  }
  const team=authorizeTask(s,kind,id,name==='claimWorkExecution')
  const latest=lastExecution(s,kind,id)
  if(name==='workExecution')return {data:{execution:latest,team:team?teamItem(s,team):null}}
  const b=req.body as RequestFor<'claimWorkExecution'>['body']
  const same=s.db.prepare('SELECT document FROM work_executions WHERE kind=? AND task_id=? AND request_id=?').get(kind,id,b.requestId)
  if(same){const value=WorkExecution.parse(decode(same.document));if(value.actorId!==actor||value.deviceId!==b.deviceId)fail('FORBIDDEN');return {data:value}}
  if(latest&&active(latest.phase))fail('ALREADY_CLAIMED')
  const rounds=Number(s.db.prepare('SELECT count(*) n FROM work_executions WHERE kind=? AND task_id=?').get(kind,id)!.n)+1
  if(team&&rounds>3)fail('RATE_LIMITED')
  const value:WorkExecution={id:randomUUID(),requestId:b.requestId,deviceId:b.deviceId,actorId:actor,phase:'claimed',startedAt:now,heartbeatAt:now,deadlineAt:new Date(s.clock()+180000).toISOString(),rounds,maxRounds:team?3:100}
  if(rounds>100)fail('RATE_LIMITED')
  s.db.prepare('INSERT INTO work_executions VALUES(?,?,?,?,?,?,?,?)').run(value.id,kind,id,b.requestId,actor,b.deviceId,value.phase,JSON.stringify(value))
  if(team)teamItem(s,team)
  return {data:value}
}

/** Publish canonical human decisions immediately, even when nobody has the group page open. */
export function notifyTeamDecision(s:ChatService,result:unknown){
 const data=(result as {data?:{id?:string;taskId?:string}})?.data;
 const id=data?.taskId||data?.id;if(!id)return;
 const row=s.db.prepare('SELECT * FROM team_work WHERE task_id=?').get(id) as TeamRow|undefined;
 if(!row)return;
 try{s.conversation(row.conversation_id,false);}catch{return;}
 teamItem(s,row);
}
