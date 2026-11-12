import { randomUUID } from 'node:crypto'
import { Contact } from '@research-agent-platform/contracts'
import type { Conversation, RequestFor } from '@research-agent-platform/contracts'
import type { ChatService, ChatCommand, ChatRequest } from './chat.js'
import { hasLabMembership } from './lab-access.js'
import { fail } from './errors.js'
import {noticeView,withdrawNotice} from './group-notices.js'

export const groupCommands = ['groupLabChoices','groupSettings','updateGroupLab','transferGroupOwner','leaveChatGroup','groupNotices','withdrawGroupNotice','groupNotice'] as const
export const groupAssistantPrincipal = (id:string) => `group:${id}`
export function isGroupAssistant(s:ChatService, contactId:string, conversationId?:string) {
  const row=s.db.prepare("SELECT principal FROM chat_contacts WHERE id=? AND kind='public_agent' AND principal GLOB 'group:*'").get(contactId)
  return !!row && (!conversationId || row.principal===groupAssistantPrincipal(conversationId))
}
export function groupLabChoices(s:ChatService) {
  const labs=s.db.prepare(`SELECT l.id,l.name FROM labs l JOIN effective_lab_memberships m ON m.lab_id=l.id
    WHERE m.member_id=? AND NOT EXISTS(SELECT 1 FROM personal_spaces p WHERE p.lab_id=l.id) ORDER BY l.id`).all(s.c.actor.id)
    .map(row=>({id:String(row.id),name:String(row.name)}))
  if(labs.length>100)fail('RATE_LIMITED')
  const primary=s.db.prepare('SELECT lab_id FROM members WHERE id=?').get(s.c.actor.id)?.lab_id
  return {labs,primaryLabId:labs.find(lab=>lab.id===primary)?.id??null}
}
export function chooseGroupLab(s:ChatService, requested:string|null|undefined) {
  const {labs}=groupLabChoices(s)
  if(requested===null)return null
  if(requested!==undefined){if(!labs.some(lab=>lab.id===requested))fail('FORBIDDEN');return requested}
  if(labs.length>1)fail('GROUP_LAB_REQUIRED')
  return labs[0]?.id??null
}
/** Called only within the route transaction, after the conversation exists. */
export function ensureGroupAssistant(s:ChatService, group:Conversation) {
  const id=`group_assistant_${group.id}`
  s.db.prepare("INSERT INTO chat_contacts VALUES (?,?, 'public_agent',?,?) ON CONFLICT(id) DO NOTHING")
    .run(id,group.labId,group.ownerMemberId,groupAssistantPrincipal(group.id))
  s.db.prepare("INSERT INTO chat_members VALUES (?,?,'joined',1,'member') ON CONFLICT(conversation_id,contact_id) DO NOTHING").run(group.id,id)
  return id
}
export function groupAssistantContact(s:ChatService,id:string):Contact|null {
  const row=s.db.prepare(`SELECT c.lab_id,c.principal,g.id group_id,g.owner_id,g.document FROM chat_contacts c
    JOIN chat_conversations g ON c.principal='group:'||g.id AND g.kind='group' WHERE c.id=? AND c.kind='public_agent'`).get(id)
  if(!row)return null
  // An instance is visible only through its joined human audience, never the directory.
  if(!s.db.prepare("SELECT 1 FROM chat_members m JOIN chat_contacts h ON h.id=m.contact_id AND h.kind='human' WHERE m.conversation_id=? AND m.status='joined' AND h.owner_id=?").get(row.group_id!,s.c.actor.id))fail('NOT_FOUND')
  const group=JSON.parse(String(row.document))
  return Contact.parse({id,labId:row.lab_id,groupConversationId:row.group_id,displayName:'群助理',version:group.version,
    identity:{kind:'public_agent',ownerMemberId:row.owner_id,capability:null},availability:s.availability(),
    profile:{role:'public_capability',version:group.version,introduction:'本群固定助理，只在被提及时回应。',
      capabilityDescription:'只读本群与获准课题组信息，通知实名转达；不批准、不代改任务或共享资产。',personality:''},
    relationship:{status:'none',requestId:null,version:0},allowedActions:[]})
}
export function canTakeOverGroup(s:ChatService, group:Conversation) {
  return !!group.labId && !hasLabMembership(s.db,group.ownerMemberId,group.labId) &&
    hasLabMembership(s.db,s.c.actor.id,group.labId) && !!s.db.prepare('SELECT 1 FROM lab_managers WHERE lab_id=? AND member_id=?').get(group.labId,s.c.actor.id)
}
function audit(s:ChatService,groupId:string,kind:string,document:unknown) {
  s.db.prepare('INSERT INTO group_governance_events VALUES (?,?,?,?,?,?)').run(randomUUID(),groupId,s.c.actor.id,kind,new Date(s.clock()).toISOString(),JSON.stringify(document))
}
function transfer(s:ChatService,group:Conversation,memberId:string) {
  const next=s.db.prepare("SELECT m.contact_id FROM chat_members m JOIN chat_contacts c ON c.id=m.contact_id AND c.kind='human' JOIN auth_accounts a ON a.member_id=c.owner_id AND a.disabled=0 WHERE m.conversation_id=? AND m.status='joined' AND c.owner_id=?").get(group.id,memberId)
  if(!next||memberId===group.ownerMemberId)fail('VALIDATION_ERROR')
  const before=group.ownerMemberId
  s.db.prepare("UPDATE chat_members SET role=CASE WHEN contact_id=? THEN 'owner' ELSE 'member' END,version=version+1 WHERE (conversation_id=? AND role='owner') OR (conversation_id=? AND contact_id=?)")
    .run(next.contact_id!,group.id,group.id,next.contact_id!)
  s.db.prepare('UPDATE chat_conversations SET owner_id=? WHERE id=?').run(memberId,group.id)
  s.db.prepare("UPDATE chat_contacts SET owner_id=? WHERE principal=? AND kind='public_agent'").run(memberId,groupAssistantPrincipal(group.id))
  group.ownerMemberId=memberId;group.version++;s.saveConversation(group)
  audit(s,group.id,'owner_changed',{from:before,to:memberId})
  const name=s.db.prepare('SELECT display_name FROM members WHERE id=?').get(memberId)?.display_name
  s.message(group.id,{senderContactId:null,origin:'service',text:`群主已变更为${name}。群归属和既有任务权限保持不变。`,mentions:[],resources:[],actionIds:[],turnId:null})
}
export function authorizeGroupCommand(s:ChatService,name:ChatCommand,req:ChatRequest) {
  if(name==='groupLabChoices')return true
  if(name==='groupNotice'){noticeView(s,req.params.id!,true);return true}
  // A completed leave may be replayed by the same authenticated actor/key only.
  // This grants no conversation/message read access after leaving.
  if(name==='leaveChatGroup'&&s.db.prepare('SELECT 1 FROM idempotency_results WHERE actor_id=? AND command=? AND resource_id=? AND key=?').get(s.c.actor.id,name,req.params.id!,req.headers['Idempotency-Key']??''))return true
  if(name==='transferGroupOwner'){
    const group=s.rawConversation(req.params.id!)
    if(group.kind!=='group')fail('NOT_FOUND')
    if(group.ownerMemberId!==s.c.actor.id&&!canTakeOverGroup(s,group))fail('FORBIDDEN')
    if(group.ownerMemberId===s.c.actor.id)s.conversation(group.id,false)
    return true
  }
  return false
}
export function handleGroupCommand(s:ChatService,name:ChatCommand,req:ChatRequest):unknown {
  if(!(groupCommands as readonly string[]).includes(name))return undefined
  if(name==='groupLabChoices')return {data:groupLabChoices(s)}
  if(name==='groupNotice')return {data:noticeView(s,req.params.id!,true)}
  if(name==='transferGroupOwner'){
    const body=req.body as RequestFor<'transferGroupOwner'>['body'],group=s.rawConversation(req.params.id!)
    authorizeGroupCommand(s,name,req);s.c.checkVersion(group.version,body.expectedVersion);transfer(s,group,body.memberId)
    return {data:{ownerMemberId:group.ownerMemberId,version:group.version}}
  }
  const group=s.conversation(req.params.id!,false)
  if(group.kind!=='group')fail('NOT_FOUND')
  if(name==='groupNotices')return {data:s.db.prepare('SELECT id FROM group_notices WHERE conversation_id=? ORDER BY created_at DESC,id DESC LIMIT 100').all(group.id).map(row=>noticeView(s,String(row.id)))}
  if(name==='withdrawGroupNotice')return {data:withdrawNotice(s,group.id,req.params.noticeId!)}
  if(name==='groupSettings')return {data:{conversation:group,labName:group.labId?String(s.db.prepare('SELECT name FROM labs WHERE id=?').get(group.labId)?.name):null,
    assistantContactId:`group_assistant_${group.id}`,canTakeOver:canTakeOverGroup(s,group)}}
  if(name==='updateGroupLab'){
    const body=req.body as RequestFor<'updateGroupLab'>['body']
    if(group.ownerMemberId!==s.c.actor.id)fail('FORBIDDEN')
    s.c.checkVersion(group.version,body.expectedVersion)
    const labId=chooseGroupLab(s,body.labId)
    if(labId!==group.labId){
      const previous=group.labId;group.labId=labId;group.version++
      s.db.prepare('UPDATE chat_conversations SET lab_id=? WHERE id=?').run(labId,group.id);s.saveConversation(group)
      s.db.prepare("UPDATE chat_contacts SET lab_id=? WHERE principal=? AND kind='public_agent'").run(labId,groupAssistantPrincipal(group.id))
      // Existing IM user/group IDs must remain stable across a provenance change.
      s.db.prepare("UPDATE im_conversations SET lab_id=?,status='pending' WHERE conversation_id=?").run(labId,group.id)
      s.db.prepare("UPDATE im_identities SET lab_id=?,status='pending',profile_version=0 WHERE contact_id=?").run(labId,`group_assistant_${group.id}`)
      audit(s,group.id,'lab_changed',{from:previous,to:labId})
      const label=labId?`平台规则 + ${s.db.prepare('SELECT name FROM labs WHERE id=?').get(labId)?.name}课题组规则`:'平台规则（不关联课题组）'
      s.message(group.id,{senderContactId:null,origin:'service',text:`自 ${new Date(s.clock()).toISOString()} 起，本群适用${label}。历史消息不变。`,mentions:[],resources:[],actionIds:[],turnId:null})
    }
    return {data:s.conversation(group.id)}
  }
  const body=req.body as RequestFor<'leaveChatGroup'>['body'];s.c.checkVersion(group.version,body.expectedVersion)
  if(group.ownerMemberId===s.c.actor.id){if(!body.successorMemberId)fail('GROUP_OWNER_TRANSFER_REQUIRED');transfer(s,group,body.successorMemberId)}
  else if(body.successorMemberId)fail('FORBIDDEN')
  s.db.prepare("UPDATE chat_members SET status='revoked',version=version+1 WHERE conversation_id=? AND contact_id=?").run(group.id,s.human().id)
  const fresh=s.rawConversation(group.id);fresh.version++;s.saveConversation(fresh)
  audit(s,group.id,'left',{memberId:s.c.actor.id})
  return {data:{left:true}}
}
