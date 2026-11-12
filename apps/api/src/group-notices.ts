import {randomUUID,createHash} from 'node:crypto'
import type {DatabaseSync} from 'node:sqlite'
import {GroupNotice,GroupNoticeRequest} from '@research-agent-platform/contracts'
import type {z} from 'zod'
import type {ChatService} from './chat.js'
import {ChatService as Service} from './chat.js'
import {fail} from './errors.js'
import {transaction} from './database.js'
import {isDatabaseBusy} from './worker-database.js'
import {serviceFor} from './execution-worker.js'
import type {Config} from './config.js'
import {isGroupAssistant} from './group-governance.js'

function joinedHuman(db:DatabaseSync,groupId:string,memberId:string){
  return !!db.prepare(`SELECT 1 FROM chat_members m JOIN chat_contacts c ON c.id=m.contact_id AND c.kind='human'
    JOIN auth_accounts a ON a.member_id=c.owner_id AND a.disabled=0
    WHERE m.conversation_id=? AND c.owner_id=? AND m.status='joined'`).get(groupId,memberId)
}
export function noticeView(s:ChatService,id:string,recipient=false){
  const row=s.db.prepare(`SELECT n.*,f.display_name from_name,t.display_name to_name FROM group_notices n
    JOIN members f ON f.id=n.from_member_id JOIN members t ON t.id=n.to_member_id WHERE n.id=?`).get(id)
  if(!row)fail('NOT_FOUND')
  if(!recipient||row.to_member_id!==s.c.actor.id)s.conversation(String(row.conversation_id),false)
  return GroupNotice.parse({id:row.id,conversationId:row.conversation_id,fromMemberId:row.from_member_id,toMemberId:row.to_member_id,
    fromName:row.from_name,toName:row.to_name,kind:row.kind,text:row.status==='withdrawn'?'发起人已撤回这条转达。':row.text,sourceMessageId:row.source_message_id,messageId:row.message_id,
    status:row.status,createdAt:row.created_at,deliveredAt:row.delivered_at,respondedAt:row.responded_at,
    canWithdraw:row.from_member_id===s.c.actor.id&&joinedHuman(s.db,String(row.conversation_id),s.c.actor.id)&&['pending','delivered'].includes(String(row.status))})
}
/** Caller is the model-output transaction. Every request is validated before commit. */
export function queueGroupNotice(s:ChatService,groupId:string,sourceId:string,agentId:string,raw:unknown){
  const request: z.infer<typeof GroupNoticeRequest>=GroupNoticeRequest.parse(raw)
  if(!isGroupAssistant(s,agentId,groupId))fail('FORBIDDEN')
  const source=s.projectedMessage(sourceId),speaker=source.senderContactId?s.contact(source.senderContactId):null
  if(source.conversationId!==groupId||source.origin!=='human'||speaker?.identity.kind!=='human')fail('FORBIDDEN')
  const from=speaker.identity.memberId
  if(from!==s.c.actor.id||!joinedHuman(s.db,groupId,from)||!joinedHuman(s.db,groupId,request.to))fail('FORBIDDEN')
  if(request.kind==='assign')fail('GROUP_ASSIGN_NOT_AVAILABLE')
  if(request.taskId)fail('VALIDATION_ERROR')
  const now=new Date(s.clock()).toISOString(),since=new Date(s.clock()-86400000).toISOString()
  const digest=createHash('sha256').update(request.text).digest('hex')
  const duplicate=s.db.prepare(`SELECT id FROM group_notices WHERE conversation_id=? AND to_member_id=? AND content_hash=? AND created_at>? AND status NOT IN ('withdrawn','cancelled') ORDER BY created_at DESC LIMIT 1`).get(groupId,request.to,digest,since)
  if(duplicate)return {notice:noticeView(s,String(duplicate.id)),duplicate:true}
  const day=new Date(Date.parse(new Date(s.clock()+8*3600000).toISOString().slice(0,10)+'T00:00:00.000Z')-8*3600000).toISOString()
  if(Number(s.db.prepare('SELECT count(*) n FROM group_notices WHERE conversation_id=? AND from_member_id=? AND created_at>=?').get(groupId,from,day)!.n)>=20)fail('GROUP_NOTICE_LIMIT')
  const id=randomUUID()
  s.db.prepare(`INSERT INTO group_notices(id,conversation_id,from_member_id,to_member_id,kind,text,content_hash,source_message_id,status,created_at)
    VALUES (?,?,?,?,?,?,?,?,'pending',?)`).run(id,groupId,from,request.to,request.kind,request.text,digest,sourceId,now)
  const receipt=s.message(groupId,{noticeId:id,senderContactId:agentId,origin:'service',text:`转达请求已排队，尚未送达。发起人：${speaker.displayName}；收件人：${noticeView(s,id).toName}。\n${request.text}`,mentions:[],resources:[],actionIds:[],turnId:null})
  s.db.prepare('UPDATE group_notices SET receipt_message_id=? WHERE id=?').run(receipt.id,id)
  return {notice:noticeView(s,id),duplicate:false}
}
export function withdrawNotice(s:ChatService,groupId:string,id:string){
  const view=noticeView(s,id)
  if(view.conversationId!==groupId||view.fromMemberId!==s.c.actor.id)fail('FORBIDDEN')
  if(view.status==='withdrawn')return view
  if(!view.canWithdraw)fail('INVALID_STATE')
  s.db.prepare("UPDATE group_notices SET status='withdrawn' WHERE id=?").run(id)
  if(view.messageId)s.db.prepare('INSERT OR IGNORE INTO chat_message_retractions VALUES (?,?,?)').run(view.messageId,s.c.actor.id,new Date(s.clock()).toISOString())
  s.message(groupId,{senderContactId:`group_assistant_${groupId}`,origin:'service',text:`${view.fromName}已撤回向${view.toName}发起的转达。`,mentions:[],resources:[],actionIds:[],turnId:null})
  return noticeView(s,id)
}
/** Only an explicit human reply to the actual delivered notice acknowledges it. */
export function respondToGroupNotice(s:ChatService,replyTo:string){
  const row=s.db.prepare("SELECT * FROM group_notices WHERE message_id=? AND to_member_id=? AND status='delivered'").get(replyTo,s.c.actor.id)
  if(!row||!joinedHuman(s.db,String(row.conversation_id),s.c.actor.id))return
  const now=new Date(s.clock()).toISOString()
  s.db.prepare("UPDATE group_notices SET status='responded',responded_at=? WHERE id=?").run(now,row.id!)
  s.message(String(row.conversation_id),{senderContactId:`group_assistant_${row.conversation_id}`,origin:'service',text:`${s.human().displayName}已回应。`,mentions:[],resources:[],actionIds:[],turnId:null})
}
/** Same delivery boundary as task invitations: durable personal service message + IM outbox. */
export class GroupNoticeWorker{
  constructor(readonly db:DatabaseSync,readonly config:Config){}
  tick(){let claimedId:string|undefined;try{return transaction(this.db,()=>{
    const row=this.db.prepare("SELECT * FROM group_notices WHERE status='pending' AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY created_at,id LIMIT 1").get(new Date().toISOString())
    if(!row)return false
    claimedId=String(row.id)
    const groupId=String(row.conversation_id),from=String(row.from_member_id),to=String(row.to_member_id)
    const valid=joinedHuman(this.db,groupId,from)&&joinedHuman(this.db,groupId,to)&&!this.db.prepare('SELECT 1 FROM chat_message_retractions WHERE message_id=?').get(row.source_message_id!)
    if(!valid){this.db.prepare("UPDATE group_notices SET status='cancelled',failure='permission_changed' WHERE id=?").run(row.id!);return true}
    const target=new Service(serviceFor(this.db,to,this.config).c,this.config)
    const result=target.handle('personalConversation',{params:{},query:{},headers:{},body:{}}) as {data:{conversation:{id:string};agent:{id:string}}}
    const sender=new Service(serviceFor(this.db,from,this.config).c,this.config),view=noticeView(sender,String(row.id)),group=sender.conversation(groupId,false)
    const message=target.message(result.data.conversation.id,{noticeId:String(row.id),senderContactId:result.data.agent.id,origin:'service',text:`群「${group.title}」中，${view.fromName}托群助理${view.kind==='ask'?'询问':'转告'}你：\n${view.text}\n引用回复这条通知后，群里只显示“已回应”，不会转发你的私聊正文。`,mentions:[],resources:[],actionIds:[],turnId:null})
    const now=new Date().toISOString()
    this.db.prepare("UPDATE group_notices SET status='delivered',message_id=?,delivered_at=? WHERE id=?").run(message.id,now,row.id!)
    sender.message(groupId,{noticeId:String(row.id),senderContactId:`group_assistant_${groupId}`,origin:'service',text:`已转达到${view.toName}的个人助理会话，时间 ${now}（不代表已读）。发起人：${view.fromName}。\n${view.text}`,mentions:[],resources:[],actionIds:[],turnId:null})
    return true
  })}catch(error){
    if(!claimedId||isDatabaseBusy(error))throw error
    const id=claimedId
    transaction(this.db,()=>{const row=this.db.prepare("SELECT delivery_attempts FROM group_notices WHERE id=? AND status='pending'").get(id);if(!row)return;
      const attempts=Number(row.delivery_attempts)+1
      this.db.prepare("UPDATE group_notices SET delivery_attempts=?,next_attempt_at=?,status=?,failure=? WHERE id=?").run(attempts,new Date(Date.now()+Math.min(300000,10000*2**attempts)).toISOString(),attempts>=3?'cancelled':'pending',attempts>=3?'delivery_failed':null,id)
    })
    console.error('GROUP_NOTICE_DELIVERY_RETRY id=%s',id)
    return true
  }}
}
