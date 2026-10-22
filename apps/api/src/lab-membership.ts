import {createHmac,randomUUID} from 'node:crypto'
import type {DatabaseSync} from 'node:sqlite'
import {Task,labMembershipRoutes,type RequestFor} from '@research-agent-platform/contracts'
import {hash,signingKey,type Actor} from './auth.js'
import {hasLabMembership,teamLabId} from './lab-access.js'
import {fail} from './errors.js'
import {Collaboration} from './collaboration.js'

export type LabMembershipCommand=keyof typeof labMembershipRoutes
export const labMembershipCommands=Object.keys(labMembershipRoutes) as LabMembershipCommand[]
const now=()=>new Date().toISOString()
function manager(db:DatabaseSync,actor:Actor,labId:string){
 if(!hasLabMembership(db,actor.id,labId))fail('NOT_FOUND')
 if(!db.prepare('SELECT 1 FROM lab_managers WHERE lab_id=? AND member_id=?').get(labId,actor.id))fail('FORBIDDEN')
}
function group(db:DatabaseSync,actor:Actor,id:string){
 if(!hasLabMembership(db,actor.id,id)||db.prepare('SELECT 1 FROM personal_spaces WHERE lab_id=?').get(id))fail('NOT_FOUND')
 const lab=db.prepare('SELECT name FROM labs WHERE id=?').get(id)!
 return {id,name:String(lab.name),role:db.prepare('SELECT 1 FROM lab_managers WHERE lab_id=? AND member_id=?').get(id,actor.id)?'manager' as const:'member' as const,memberCount:Number(db.prepare('SELECT count(*) n FROM effective_lab_memberships g JOIN auth_accounts a ON a.member_id=g.member_id AND a.disabled=0 WHERE g.lab_id=?').get(id)!.n)}
}
function invitation(db:DatabaseSync,id:string){
 const row=db.prepare(`SELECT i.*,l.name,inviter.display_name inviter_name,m.display_name member_name FROM lab_member_invitations i JOIN labs l ON l.id=i.lab_id JOIN members inviter ON inviter.id=i.inviter_id JOIN members m ON m.id=i.member_id WHERE i.id=?`).get(id)
 if(!row)fail('NOT_FOUND')
 return {id:String(row.id),labId:String(row.lab_id),labName:String(row.name),inviterName:String(row.inviter_name),memberId:String(row.member_id),memberName:String(row.member_name),status:row.status as 'pending'|'accepted'|'declined'|'revoked',version:Number(row.version),expiresAt:String(row.expires_at)}
}
function select(db:DatabaseSync,memberId:string,labId:string){
 db.prepare('INSERT INTO member_lab_contexts VALUES (?,?,1) ON CONFLICT(member_id) DO UPDATE SET lab_id=excluded.lab_id,version=version+1').run(memberId,labId)
}
function personalSpace(db:DatabaseSync,memberId:string){
 const existing=db.prepare('SELECT lab_id FROM personal_spaces WHERE owner_id=?').get(memberId)
 if(existing)return String(existing.lab_id)
 const id=`personal_${randomUUID()}`,member=db.prepare('SELECT display_name FROM members WHERE id=?').get(memberId)!
 db.prepare('INSERT INTO labs VALUES (?,?)').run(id,`${member.display_name}的个人空间`)
 db.prepare('INSERT INTO personal_spaces VALUES (?,?)').run(id,memberId)
 return id
}
function add(db:DatabaseSync,memberId:string,labId:string){
 if(Number(db.prepare('SELECT count(*) n FROM effective_lab_memberships WHERE member_id=?').get(memberId)!.n)>=50)fail('RATE_LIMITED')
 if(Number(db.prepare('SELECT count(*) n FROM effective_lab_memberships WHERE lab_id=?').get(labId)!.n)>=500)fail('RATE_LIMITED')
 db.prepare("INSERT INTO lab_memberships VALUES (?,?,'active',?,1) ON CONFLICT(lab_id,member_id) DO UPDATE SET status='active',joined_at=excluded.joined_at,version=version+1").run(labId,memberId,now())
 select(db,memberId,labId)
}
function remove(db:DatabaseSync,actor:Actor,memberId:string,labId:string){
 if(db.prepare('SELECT 1 FROM lab_managers WHERE lab_id=? AND member_id=?').get(labId,memberId))fail('LAB_MANAGER_CANNOT_LEAVE')
 if(!hasLabMembership(db,memberId,labId))fail('NOT_FOUND')
 if(db.prepare("SELECT 1 FROM tasks WHERE lab_id=? AND status NOT IN ('completed','cancelled') AND (initiator_id=? OR reviewer_id=?)").get(labId,memberId,memberId))fail('LAB_MEMBER_HAS_ACTIVE_TASKS')
 const collaboration=new Collaboration(db,{...actor,teamLabId:labId})
 for(const row of db.prepare("SELECT document FROM tasks WHERE lab_id=? AND status NOT IN ('completed','cancelled') AND (lead_id=? OR EXISTS(SELECT 1 FROM assignments a WHERE a.task_id=tasks.id AND a.member_id=? AND a.status IN ('pending','accepted')))").all(labId,memberId,memberId)){
  const task=Task.parse(JSON.parse(String(row.document)))
  collaboration.coordination.endMember(task,memberId,'cancelled')
  collaboration.coordination.touch(task,'access_revoked','Member left the research group; assignment ended.')
  collaboration.coordination.impact(task,'access_revoked')
 }
 db.prepare("INSERT INTO lab_memberships VALUES (?,?,'removed',?,2) ON CONFLICT(lab_id,member_id) DO UPDATE SET status='removed',version=version+1").run(labId,memberId,now())
 // Rejoining never resurrects earlier private task grants or material sharing.
 db.prepare("UPDATE task_access SET access='revoked' WHERE member_id=? AND task_id IN (SELECT id FROM tasks WHERE lab_id=?)").run(memberId,labId)
 db.prepare("UPDATE research_collections SET scope='owner_private',version=version+1,updated_at=? WHERE owner_id=? AND scope='lab_shared' AND id IN (SELECT collection_id FROM research_collection_labs WHERE lab_id=?)").run(now(),memberId,labId)
 db.prepare("UPDATE research_collections SET version=version+1,updated_at=? WHERE scope='lab_shared' AND id IN (SELECT collection_id FROM research_collection_labs WHERE lab_id=?)").run(now(),labId)
 db.prepare("UPDATE lab_member_invitations SET status='revoked',version=version+1,updated_at=? WHERE member_id=? AND lab_id=? AND status='pending'").run(now(),memberId,labId)
 const home=personalSpace(db,memberId)
 const context=db.prepare('SELECT lab_id FROM member_lab_contexts WHERE member_id=?').get(memberId)
 if(!context||context.lab_id===labId)select(db,memberId,home)
}
function codeInvite(db:DatabaseSync,code:string){
 const row=db.prepare('SELECT * FROM registration_invites WHERE code_hash=? AND bootstrap_manager=0 AND revoked_at IS NULL AND expires_at>? AND used_count<max_uses').get(hash(code),now())
 if(!row||db.prepare('SELECT 1 FROM personal_spaces WHERE lab_id=?').get(row.lab_id!))fail('INVITE_UNAVAILABLE')
 // Operator-created legacy invites remain usable; a removed manager's codes do not.
 if(row.created_by&&!db.prepare('SELECT 1 FROM lab_managers WHERE lab_id=? AND member_id=?').get(row.lab_id!,row.created_by))fail('INVITE_UNAVAILABLE')
 return row
}
export function runLabMembership(db:DatabaseSync,actor:Actor,name:LabMembershipCommand,req:RequestFor<LabMembershipCommand>):unknown{
 const params=req.params as {id?:string;memberId?:string},body=req.body as Record<string,unknown>,id=params.id!
 // Authorize before replay, so a removed member/manager cannot replay old grants.
 if(['labMembership','renameLab','inviteLabMember','removeLabMember'].includes(name))group(db,actor,id)
 if(['renameLab','inviteLabMember','removeLabMember'].includes(name))manager(db,actor,id)
 if(name==='decideLabInvitation'){if(invitation(db,id).memberId!==actor.id)fail('NOT_FOUND')}
 if(name==='revokeLabInvitation')manager(db,actor,invitation(db,id).labId)
 const key=req.headers['Idempotency-Key'],resource=id??'*'
 const fingerprint=createHmac('sha256',signingKey(db)).update(JSON.stringify({params:req.params,body:req.body})).digest('hex')
 const cached=key?db.prepare('SELECT request_hash,response_json FROM idempotency_results WHERE actor_id=? AND command=? AND resource_id=? AND key=?').get(actor.id,name,resource,key):null
 if(cached){if(cached.request_hash!==fingerprint)fail('IDEMPOTENCY_CONFLICT');const prior=JSON.parse(String(cached.response_json));if(['createLab','joinLab'].includes(name)&&!hasLabMembership(db,actor.id,String(prior.data.id)))fail('NOT_FOUND');if(name==='selectLab'&&!hasLabMembership(db,actor.id,String(body.labId)))fail('NOT_FOUND');if(name==='decideLabInvitation'&&body.decision==='accepted'&&!hasLabMembership(db,actor.id,invitation(db,id).labId))fail('NOT_FOUND');return prior}
 let result:unknown
 if(name==='myLabs'){
  const groups=db.prepare('SELECT lab_id FROM effective_lab_memberships WHERE member_id=? ORDER BY lab_id LIMIT 50').all(actor.id).map(r=>group(db,actor,String(r.lab_id)))
  const incoming=db.prepare("SELECT id FROM lab_member_invitations WHERE member_id=? AND status='pending' AND expires_at>? ORDER BY created_at DESC LIMIT 50").all(actor.id,now())
  const personal=db.prepare('SELECT lab_id FROM personal_spaces WHERE owner_id=?').get(actor.id)
  result={data:{groups,currentLabId:teamLabId(actor),personalLabId:personal?String(personal.lab_id):null,invitations:incoming.map(r=>invitation(db,String(r.id)))}}
 }else if(name==='createLab'){
  if(db.prepare('SELECT 1 FROM lab_managers WHERE member_id=?').get(actor.id))fail('LAB_ALREADY_MANAGED')
  const created=`lab_${randomUUID()}`
  db.prepare('INSERT INTO labs VALUES (?,?)').run(created,String(body.name));add(db,actor.id,created)
  db.prepare('INSERT INTO lab_managers VALUES (?,?,?,NULL)').run(created,actor.id,now())
  result={data:group(db,actor,created)}
 }else if(name==='selectLab'){
  if(!hasLabMembership(db,actor.id,String(body.labId)))fail('NOT_FOUND')
  select(db,actor.id,String(body.labId));result={data:{labId:body.labId}}
 }else if(name==='labMembership'){
  const members=db.prepare(`SELECT m.id,m.display_name,a.username,COALESCE(g.version,m.version) version FROM effective_lab_memberships e JOIN members m ON m.id=e.member_id JOIN auth_accounts a ON a.member_id=m.id AND a.disabled=0 LEFT JOIN lab_memberships g ON g.member_id=m.id AND g.lab_id=e.lab_id WHERE e.lab_id=? ORDER BY m.id LIMIT 500`).all(id)
  const owner=db.prepare('SELECT member_id FROM lab_managers WHERE lab_id=?').get(id)
  const invites=db.prepare("SELECT id FROM lab_member_invitations WHERE lab_id=? AND status='pending' AND expires_at>? ORDER BY created_at DESC LIMIT 50").all(id,now())
  result={data:{group:group(db,actor,id),members:members.map(m=>({id:String(m.id),username:String(m.username),displayName:String(m.display_name),version:Number(m.version),role:owner?.member_id===m.id?'manager':'member'})),invitations:owner?.member_id===actor.id?invites.map(r=>invitation(db,String(r.id))):[]}}
 }else if(name==='inviteLabMember'){
  const target=db.prepare('SELECT member_id FROM auth_accounts WHERE username=? AND disabled=0').get(String(body.username))
  if(!target)fail('LAB_ACCOUNT_NOT_FOUND')
  const memberId=String(target.member_id)
  if(hasLabMembership(db,memberId,id))fail('LAB_ALREADY_JOINED')
  db.prepare("UPDATE lab_member_invitations SET status='revoked',version=version+1,updated_at=? WHERE lab_id=? AND member_id=? AND status='pending' AND expires_at<=?").run(now(),id,memberId,now())
  const pending=db.prepare("SELECT id FROM lab_member_invitations WHERE lab_id=? AND member_id=? AND status='pending'").get(id,memberId)
  if(pending)result={data:invitation(db,String(pending.id))}
  else{
   if(Number(db.prepare("SELECT count(*) n FROM lab_member_invitations WHERE lab_id=? AND status='pending' AND expires_at>?").get(id,now())!.n)>=50)fail('RATE_LIMITED')
   const created=randomUUID(),at=now();db.prepare("INSERT INTO lab_member_invitations VALUES (?,?,?,?,'pending',1,?,?,?)").run(created,id,actor.id,memberId,at,new Date(Date.now()+7*86400000).toISOString(),at)
   result={data:invitation(db,created)}
  }
 }else if(name==='decideLabInvitation'){
  const invite=invitation(db,id)
  if(invite.version!==body.expectedVersion)fail('VERSION_CONFLICT')
  if(invite.status!=='pending'||invite.expiresAt<=now())fail('INVITE_UNAVAILABLE')
  const original=db.prepare('SELECT inviter_id FROM lab_member_invitations WHERE id=?').get(id)!
  if(!db.prepare('SELECT 1 FROM lab_managers WHERE lab_id=? AND member_id=?').get(invite.labId,original.inviter_id!))fail('INVITE_UNAVAILABLE')
  if(body.decision==='accepted'&&!hasLabMembership(db,actor.id,invite.labId))add(db,actor.id,invite.labId)
  db.prepare('UPDATE lab_member_invitations SET status=?,version=version+1,updated_at=? WHERE id=?').run(String(body.decision),now(),id)
  result={data:invitation(db,id)}
 }else if(name==='revokeLabInvitation'){
  const invite=invitation(db,id);if(invite.version!==body.expectedVersion)fail('VERSION_CONFLICT');if(invite.status!=='pending')fail('INVALID_STATE')
  db.prepare("UPDATE lab_member_invitations SET status='revoked',version=version+1,updated_at=? WHERE id=?").run(now(),id);result={data:invitation(db,id)}
 }else if(name==='previewLabCode'){
  const invite=codeInvite(db,String(body.inviteCode));result={data:{labId:invite.lab_id,name:db.prepare('SELECT name FROM labs WHERE id=?').get(invite.lab_id!)!.name,expiresAt:invite.expires_at}}
 }else if(name==='joinLab'){
  const invite=codeInvite(db,String(body.inviteCode)),labId=String(invite.lab_id)
  if(!hasLabMembership(db,actor.id,labId)){add(db,actor.id,labId);db.prepare('UPDATE registration_invites SET used_count=used_count+1 WHERE id=?').run(invite.id!)}
  else select(db,actor.id,labId)
  result={data:group(db,actor,labId)}
 }else if(name==='removeLabMember'){
  const current=db.prepare('SELECT COALESCE(g.version,m.version) version FROM members m LEFT JOIN lab_memberships g ON g.member_id=m.id AND g.lab_id=? WHERE m.id=?').get(id,params.memberId!)
  if(!current)fail('NOT_FOUND');if(current.version!==body.expectedVersion)fail('VERSION_CONFLICT')
  remove(db,actor,params.memberId!,id);result={data:{removed:true}}
 }else if(name==='leaveLab'){
  remove(db,actor,actor.id,id);result={data:{left:true}}
 }else if(name==='renameLab'){
  db.prepare('UPDATE labs SET name=? WHERE id=?').run(String(body.name),id);result={data:group(db,actor,id)}
 }else fail('NOT_IMPLEMENTED')
 const parsed=labMembershipRoutes[name].response.parse(result)
 if(key){db.prepare('INSERT INTO idempotency_results VALUES (?,?,?,?,?,?,?,?)').run(actor.id,name,resource,key,fingerprint,JSON.stringify(parsed),labMembershipRoutes[name].status,now());db.exec("UPDATE runtime_meta SET value=CAST(value AS INTEGER)+1 WHERE key='revision'")}
 return parsed
}
