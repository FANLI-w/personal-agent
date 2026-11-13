import { randomUUID } from 'node:crypto'
import { Contact, ContactProfile, ContactRequest, ChatMemory } from '@research-agent-platform/contracts'
import type { RequestFor } from '@research-agent-platform/contracts'
import type { ChatService, ChatCommand, ChatRequest } from './chat.js'
import { canonical, instant } from './ai.js'
import { hash } from './auth.js'
import { fail } from './errors.js'
import { connectionCommands, ownedSpecialist, externalContact, handleConnection } from './agent-connections.js'
import { isLabManager } from './invite-management.js'
import { roleCatalogDigest } from './agent-roles.js'
import { agentDeleted, requireActiveAgent } from './agent-lifecycle.js'
import { deletionOwner, deletePersonalAgent } from './agent-removal.js'

export const directoryCommands = ['deletePersonalAgent','importAgentProfile','exportAgentProfile',...connectionCommands,'chatContact','updateContactProfile','createPersonalAgent','requestContact','contactRequests','decideContactRequest','revokeContact','revokeContactRequest','chatMemories','createChatMemory','reviseChatMemory','revokeChatMemory','chatMemoryHistory'] as const
export class ContactDirectory {
  constructor(readonly chat: ChatService) {}
  get db() { return this.chat.db }
  get actor() { return this.chat.c.actor }
  profile(id: string): ContactProfile & {displayName:string|null} {
    const row = this.db.prepare('SELECT * FROM chat_contacts WHERE id=?').get(id)
    if (!row) fail('NOT_FOUND')
    const role = row.kind === 'human' ? 'human' : row.kind === 'public_agent' ? 'public_capability' : row.principal === row.owner_id ? 'coordinator' : 'specialist'
    this.db.prepare('INSERT INTO chat_contact_profiles(contact_id,role) VALUES (?,?) ON CONFLICT(contact_id) DO NOTHING').run(id, role)
    const p = this.db.prepare('SELECT * FROM chat_contact_profiles WHERE contact_id=?').get(id)!
    return { ...ContactProfile.parse({ role:p.role, introduction:p.introduction, capabilityDescription:p.capability_description, personality:p.personality, version:p.version }), displayName: p.display_name as string|null }
  }
  relationKey(contact: Contact) {
    if (contact.identity.kind === 'human') return `human:${[this.actor.id,contact.identity.memberId].sort().join(':')}`
    return `agent:${this.actor.id}:${contact.id}`
  }
  relationRow(contact: Contact) { return this.db.prepare('SELECT * FROM chat_contact_requests WHERE relation_key=?').get(this.relationKey(contact)) }
  owns(contact: Contact) { return contact.identity.kind === 'human' ? contact.identity.memberId === this.actor.id : contact.identity.kind === 'personal_agent' && contact.identity.ownerMemberId === this.actor.id }
  mayEdit(contact: Contact) { return !contact.groupConversationId && (this.owns(contact) || (contact.identity.kind === 'public_agent' && isLabManager(this.db,this.actor))) }
  contact(id: string): Contact {
    const value = this.chat.baseContact(id)
    if(value.groupConversationId)return value
    const p = this.profile(id), { displayName, ...profile } = p
    value.profile = profile; if (displayName) value.displayName = displayName
    if (agentDeleted(this.db, id)) {
      value.displayName = value.displayName.slice(0, 150) + '（已删除）'
      value.allowedActions = []; value.availability = { status: 'disabled', reason: 'capability_unavailable' }
      value.relationship = this.owns(value) ? { status: 'own', requestId: null, version: 0 } : { status: 'revoked', requestId: null, version: 0 }
      return Contact.parse(value)
    }
    const own = this.owns(value), relation = own ? undefined : this.relationRow(value)
    value.relationship = own ? {status:'own',requestId:null,version:0} : relation ? { status: relation.status==='pending' ? relation.requester_id===this.actor.id?'pending_outbound':'pending_inbound' : relation.status as 'accepted'|'declined'|'revoked', requestId:String(relation.id),version:Number(relation.version) } : {status:'none',requestId:null,version:0}
    value.allowedActions=[]
    if ((own && value.identity.kind!=='human') || relation?.status==='accepted') value.allowedActions.push('chat')
    if (!own && (!relation || ['declined','revoked'].includes(String(relation.status)))) value.allowedActions.push('request')
    if (!own && relation && ['pending','accepted'].includes(String(relation.status))) value.allowedActions.push('remove')
    if (this.mayEdit(value)) value.allowedActions.push('edit_profile')
    if (value.identity.kind==='personal_agent' && own) value.allowedActions.push('manage_private_memory')
    if (value.identity.kind==='personal_agent' && relation?.status==='accepted') value.availability=this.chat.availability()
    return Contact.parse(externalContact(this.chat,value))
  }
  requireDirect(contact: Contact) { if (!contact.allowedActions.includes('chat')) fail('FORBIDDEN') }
  request(id: string): ContactRequest {
    const row=this.db.prepare('SELECT * FROM chat_contact_requests WHERE id=?').get(id)
    if(!row || (row.requester_id!==this.actor.id && row.decider_id!==this.actor.id))fail('NOT_FOUND')
    this.chat.baseContact(String(row.target_contact_id)); const requester=this.chat.human(String(row.requester_id))
    return ContactRequest.parse({id:row.id,requesterMemberId:row.requester_id,requesterContactId:requester.id,targetContactId:row.target_contact_id,deciderMemberId:row.decider_id,status:row.status,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at,allowedDecisions:row.decider_id===this.actor.id&&row.status==='pending'?['accept','decline']:[]})
  }
  revokeRequest(id:string, expectedVersion:number) {
    const request=this.request(id); this.chat.c.checkVersion(request.version,expectedVersion)
    if(!['pending','accepted'].includes(request.status))fail('INVALID_STATE')
    this.db.prepare("UPDATE chat_contact_requests SET status='revoked',version=version+1,updated_at=? WHERE id=?").run(instant(),id)
    return this.request(id)
  }
  memoryScope(scope: ChatMemory['scope'],scopeId:string, write=false) {
    if(scope==='private_agent') {
      const contact=this.contact(scopeId)
      if(contact.identity.kind!=='personal_agent'||contact.identity.ownerMemberId!==this.actor.id)fail('NOT_FOUND')
      if(write)requireActiveAgent(this.db,scopeId)
    } else {
      const conversation=this.chat.conversation(scopeId,false)
      if(write && conversation.ownerMemberId!==this.actor.id)fail('FORBIDDEN')
      if(write && !conversation.allowedActions.includes('manage_memory'))fail('FORBIDDEN')
    }
  }
  privateAgentMemory(row:Record<string,unknown>, write=false):ChatMemory {
    const scopeId=String(row.subject_id)
    this.memoryScope('private_agent',scopeId,write)
    let mayEdit=true;try{this.memoryScope('private_agent',scopeId,true)}catch{mayEdit=false}
    const payload=JSON.parse(String(row.payload_json)) as {text?:string;value?:string}
    const status=row.status==='revoked'?'revoked':'active'
    return ChatMemory.parse({id:String(row.id),scope:'private_agent',scopeId,content:String(row.detail??payload.text??payload.value??''),source:row.source_label?String(row.source_label):(row.source_id?String(row.source_id):null),status,version:Number(row.version),createdByMemberId:String(row.owner_id),createdAt:String(row.created_at),updatedAt:String(row.updated_at),allowedActions:mayEdit&&status==='active'?['edit','revoke']:[]})
  }
  memory(id:string,write=false):ChatMemory {
    const agentRow=this.db.prepare("SELECT * FROM assistant_memories WHERE id=? AND scope='agent'").get(id) as Record<string,unknown>|undefined
    if(agentRow)return this.privateAgentMemory(agentRow,write)
    const row=this.db.prepare('SELECT * FROM chat_memories WHERE id=?').get(id)
    if(!row)fail('NOT_FOUND')
    this.memoryScope(row.scope as ChatMemory['scope'],String(row.scope_id),write)
    let mayWrite=true;try{this.memoryScope(row.scope as ChatMemory['scope'],String(row.scope_id),true)}catch{mayWrite=false}
    return ChatMemory.parse({id,scope:row.scope,scopeId:row.scope_id,content:row.content,source:row.source,status:row.status,version:row.version,createdByMemberId:row.created_by,createdAt:row.created_at,updatedAt:row.updated_at,allowedActions:mayWrite&&row.status==='active'?['edit','revoke']:[]})
  }
  saveMemory(value:ChatMemory) {
    const {allowedActions:_allowed,...revision}=value
    if(value.scope==='private_agent')this.db.prepare('INSERT INTO assistant_memory_revisions VALUES (?,?,?,?)').run(value.id,value.version,JSON.stringify({...revision,allowedActions:[]}),value.updatedAt)
    else this.db.prepare('INSERT INTO chat_memory_revisions VALUES (?,?,?)').run(value.id,value.version,JSON.stringify({...revision,allowedActions:[]}))
  }
  modelContext(agentId:string,conversationId:string) {
    const agent=this.contact(agentId), conversation=this.chat.conversation(conversationId,false)
    const privateAllowed=agent.identity.kind==='personal_agent' && agent.identity.ownerMemberId===this.actor.id && (conversation.kind==='personal'||conversation.kind==='direct')
    const rows=this.db.prepare("SELECT id FROM chat_memories WHERE status='active' AND scope='conversation' AND scope_id=? ORDER BY id").all(conversationId)
    const agentRows=privateAllowed?this.db.prepare("SELECT * FROM assistant_memories WHERE scope='agent' AND subject_id=? AND status='confirmed' ORDER BY id").all(agentId) as Record<string,unknown>[]:[]
    const memories=[...rows.map(row=>this.memory(String(row.id))),...agentRows.map(row=>this.privateAgentMemory(row))].sort((a,b)=>a.id.localeCompare(b.id))
    const relation=this.relationRow(agent)
    // Coordinator recommendations depend on the bounded public roster. A changed
    // candidate profile cannot leave an older matching proposal publishable.
    const roster=agent.profile.role==='coordinator'&&conversation.kind==='personal'?this.db.prepare('SELECT id FROM chat_contacts WHERE lab_id=? ORDER BY id').all(this.actor.labId).flatMap(row=>{try{const c=this.contact(String(row.id));return [{id:c.id,version:c.version,profileVersion:c.profile.version}]}catch{return []}}).slice(0,100):null
    const fingerprint=hash(canonical({agentId,agentVersion:agent.version,profileVersion:agent.profile.version,roleCatalogDigest,roster,relation:conversation.kind==='direct'?{id:relation?.id??null,version:relation?.version??0,status:relation?.status??'own'}:null,memories:memories.map(m=>({id:m.id,version:m.version}))}))
    return {agent, memories:memories.map(({allowedActions:_allowed,...memory})=>memory), fingerprint}
  }
  authorize(name:ChatCommand,req:ChatRequest) {
    if(!(directoryCommands as readonly string[]).includes(name))return false
    const id=req.params.id!
    if(name==='deletePersonalAgent'){deletionOwner(this.chat,id);return true}
    if((connectionCommands as readonly string[]).includes(name)||name==='exportAgentProfile'){ownedSpecialist(this.chat,id);return true}
    if(['chatContact','requestContact','revokeContact','updateContactProfile'].includes(name)) {
      if(name!=='chatContact'&&this.contact(id).groupConversationId)fail('GROUP_AGENT_NOT_ALLOWED')
      const contact=this.contact(id); if(name!=='chatContact')requireActiveAgent(this.db,id); if(name==='updateContactProfile'&&!this.mayEdit(contact))fail('FORBIDDEN')
    } else if(['decideContactRequest','revokeContactRequest'].includes(name)) {
      const request=this.request(id); if(name==='decideContactRequest'&&request.deciderMemberId!==this.actor.id)fail('FORBIDDEN')
    } else if(name==='chatMemories') this.memoryScope(req.query.scope as ChatMemory['scope'],req.query.scopeId!)
    else if(name==='createChatMemory') {const b=req.body as RequestFor<'createChatMemory'>['body'];this.memoryScope(b.scope,b.scopeId,true)}
    else if(['reviseChatMemory','revokeChatMemory','chatMemoryHistory'].includes(name))this.memory(id,name!=='chatMemoryHistory')
    return true
  }
  replay(name:ChatCommand,previous:any) {
    if(name==='importAgentProfile')return {data:{...previous.data,contact:this.contact(previous.data.contact.id),conversation:this.chat.conversation(previous.data.conversation.id)}}
    if(['chatContact','requestContact','revokeContact','updateContactProfile','createPersonalAgent'].includes(name)) return {data:this.contact(previous.data.id)}
    if(['decideContactRequest','revokeContactRequest'].includes(name))return {data:this.request(previous.data.id)}
    if(['createChatMemory','reviseChatMemory','revokeChatMemory'].includes(name))return {data:this.memory(previous.data.id,true)}
    return undefined
  }
  handle(name:ChatCommand,req:ChatRequest):unknown {
    const id=req.params.id!,b=req.body
    if(name==='deletePersonalAgent')return deletePersonalAgent(this.chat,id,(b as RequestFor<'deletePersonalAgent'>['body']).expectedVersion)
    if((connectionCommands as readonly string[]).includes(name))return handleConnection(this.chat,name as typeof connectionCommands[number],req)
    if(name==='exportAgentProfile'){const c=ownedSpecialist(this.chat,id);return {data:{format:'research-agent-profile/v1',profile:{displayName:c.displayName,introduction:c.profile.introduction,capabilityDescription:c.profile.capabilityDescription,personality:c.profile.personality}}}}
    if(name==='importAgentProfile'){
      const profile=(b as RequestFor<'importAgentProfile'>['body']).profile
      const old=this.db.prepare("SELECT c.id FROM chat_contacts c JOIN chat_contact_profiles p ON p.contact_id=c.id WHERE c.owner_id=? AND c.kind='personal_agent' AND p.role='specialist' AND c.id NOT IN (SELECT contact_id FROM deleted_personal_agents) AND p.display_name=? AND p.introduction=? AND p.capability_description=? AND p.personality=? AND NOT EXISTS(SELECT 1 FROM agent_connections a WHERE a.contact_id=c.id AND a.configured=1) ORDER BY c.id LIMIT 1").get(this.actor.id,profile.displayName,profile.introduction,profile.capabilityDescription,profile.personality)
      const key='import_'+hash(this.actor.id+':'+req.headers['Idempotency-Key']).slice(0,48)
      const request=(body:unknown,part:string):ChatRequest=>({params:{},query:{},body,headers:{'Idempotency-Key':key+'_'+part}})
      const contact=old?this.contact(String(old.id)):(this.chat.run('createPersonalAgent',request(profile,'profile')) as {data:Contact}).data
      const conversation=(this.chat.run('createDirectConversation',request({contactId:contact.id},'direct')) as {data:import('@research-agent-platform/contracts').Conversation}).data
      return {data:{contact,conversation,reused:!!old,mode:'profile_only'}}
    }
    if(name==='chatContact')return {data:this.contact(id)}
    if(name==='updateContactProfile') {
      const contact=this.contact(id),body=b as RequestFor<'updateContactProfile'>['body'];this.chat.c.checkVersion(contact.profile.version,body.expectedVersion)
      if(contact.identity.kind==='human')this.db.prepare('UPDATE members SET display_name=?,version=version+1 WHERE id=?').run(body.displayName,this.actor.id)
      this.db.prepare('UPDATE chat_contact_profiles SET display_name=?,introduction=?,capability_description=?,personality=?,version=version+1 WHERE contact_id=?').run(contact.identity.kind==='human'?null:body.displayName,body.introduction,body.capabilityDescription,body.personality,id)
      return {data:this.contact(id)}
    }
    if(name==='createPersonalAgent') {
      if(Number(this.db.prepare("SELECT count(*) n FROM chat_contacts WHERE lab_id=? AND kind='personal_agent' AND owner_id=? AND principal<>owner_id AND id NOT IN (SELECT contact_id FROM deleted_personal_agents)").get(this.actor.labId,this.actor.id)!.n)>=20)fail('RATE_LIMITED')
      const body=b as RequestFor<'createPersonalAgent'>['body'],contactId=randomUUID()
      this.db.prepare("INSERT INTO chat_contacts VALUES (?,?,'personal_agent',?,?)").run(contactId,this.actor.labId,this.actor.id,randomUUID())
      this.db.prepare("INSERT INTO chat_contact_profiles VALUES (?,?,'specialist',?,?,?,1)").run(contactId,body.displayName,body.introduction,body.capabilityDescription,body.personality)
      return {data:this.contact(contactId)}
    }
    if(name==='requestContact') {
      const contact=this.contact(id);if(this.owns(contact))return {data:contact}
      const old=this.relationRow(contact);if(old&&['pending','accepted'].includes(String(old.status)))return {data:contact}
      if(contact.identity.kind==='public_agent'&&this.chat.ai.capability()?.status!=='available')fail('CAPABILITY_UNAVAILABLE')
      const now=instant(),status=contact.identity.kind==='public_agent'?'accepted':'pending',owner=contact.identity.kind==='human'?contact.identity.memberId:contact.identity.ownerMemberId
      if(old)this.db.prepare('UPDATE chat_contact_requests SET requester_id=?,target_contact_id=?,decider_id=?,status=?,version=version+1,created_at=?,updated_at=? WHERE id=?').run(this.actor.id,id,owner,status,now,now,old.id!)
      else this.db.prepare('INSERT INTO chat_contact_requests VALUES (?,?,?,?,?,?,?,1,?,?)').run(randomUUID(),this.actor.labId,this.actor.id,id,owner,this.relationKey(contact),status,now,now)
      return {data:this.contact(id)}
    }
    if(name==='contactRequests') {
      const rows=this.db.prepare('SELECT id FROM chat_contact_requests WHERE (requester_id=? OR decider_id=?) ORDER BY created_at DESC,id DESC').all(this.actor.id,this.actor.id).map(row=>String(row.id))
      const project=(id:string)=>{const r=this.request(id);if((req.query.status!=='all'&&r.status!=='pending')||(req.query.direction!=='all'&&(req.query.direction==='incoming'?r.deciderMemberId!==this.actor.id:r.requesterMemberId!==this.actor.id)))fail('NOT_FOUND');return r}
      return this.chat.page(name,req.query,rows,project)
    }
    if(name==='decideContactRequest') {
      const request=this.request(id),body=b as RequestFor<'decideContactRequest'>['body'];this.chat.c.checkVersion(request.version,body.expectedVersion)
      if(request.status!=='pending')fail('INVALID_STATE')
      this.db.prepare('UPDATE chat_contact_requests SET status=?,version=version+1,updated_at=? WHERE id=?').run(body.decision==='accept'?'accepted':'declined',instant(),id)
      return {data:this.request(id)}
    }
    if(name==='revokeContactRequest')return {data:this.revokeRequest(id,(b as RequestFor<'revokeContactRequest'>['body']).expectedVersion)}
    if(name==='revokeContact') {
      const contact=this.contact(id),row=this.relationRow(contact);if(!row)fail('NOT_FOUND')
      this.revokeRequest(String(row.id),(b as RequestFor<'revokeContact'>['body']).expectedVersion);return {data:this.contact(id)}
    }
    if(name==='chatMemories'){
      const scope=req.query.scope as ChatMemory['scope']
      const ids=scope==='private_agent'
        ?this.db.prepare("SELECT id FROM assistant_memories WHERE scope='agent' AND subject_id=? AND status='confirmed' ORDER BY created_at DESC,id DESC").all(req.query.scopeId!).map(row=>String(row.id))
        :this.db.prepare("SELECT id FROM chat_memories WHERE scope='conversation' AND scope_id=? AND status='active' ORDER BY created_at DESC,id DESC").all(req.query.scopeId!).map(row=>String(row.id))
      return this.chat.page(name,req.query,ids,id=>{const memory=this.memory(id);if(memory.status!=='active')fail('NOT_FOUND');return memory})
    }
    if(name==='createChatMemory') {
      const body=b as RequestFor<'createChatMemory'>['body'],now=instant(),memoryId=randomUUID()
      if(body.scope==='private_agent'){
        if(Number(this.db.prepare("SELECT count(*) n FROM assistant_memories WHERE scope='agent' AND subject_id=? AND status='confirmed'").get(body.scopeId)!.n)>=10)fail('RATE_LIMITED')
        this.db.prepare("INSERT INTO assistant_memories(id,owner_id,lab_id,scope,subject_id,type,status,origin,source_kind,source_id,source_version,source_label,summary,detail,payload_json,schema_version,version,created_at,updated_at) VALUES(?,?,?,'agent',?,'note','confirmed','explicit','manual',NULL,NULL,?,?,?,?,1,1,?,?)").run(memoryId,this.actor.id,this.actor.labId,body.scopeId,body.source,body.content.slice(0,300),body.content,JSON.stringify({type:'note',text:body.content}),now,now)
      }else{
        if(Number(this.db.prepare("SELECT count(*) n FROM chat_memories WHERE scope='conversation' AND scope_id=? AND status='active'").get(body.scopeId)!.n)>=10)fail('RATE_LIMITED')
        this.db.prepare("INSERT INTO chat_memories VALUES (?,?,?,?,?,'active',1,?,?,?,?)").run(memoryId,this.actor.labId,body.scope,body.scopeId,this.actor.id,body.content,body.source,now,now)
      }
      const value=this.memory(memoryId,true);this.saveMemory(value);return {data:value}
    }
    if(name==='reviseChatMemory'||name==='revokeChatMemory') {
      const memory=this.memory(id,true),body=b as RequestFor<'reviseChatMemory'>['body'];this.chat.c.checkVersion(memory.version,body.expectedVersion)
      if(memory.status!=='active')fail('INVALID_STATE');if(memory.version>=100)fail('RATE_LIMITED')
      if(memory.scope==='private_agent'){
        const content=name==='reviseChatMemory'?body.content:memory.content,source=name==='reviseChatMemory'?body.source:memory.source
        this.db.prepare("UPDATE assistant_memories SET status=?,summary=?,detail=?,payload_json=?,source_label=?,conflict=0,version=version+1,updated_at=? WHERE id=?").run(name==='revokeChatMemory'?'revoked':'confirmed',content.slice(0,300),content,JSON.stringify({type:'note',text:content}),source,instant(),id)
      }else this.db.prepare('UPDATE chat_memories SET content=?,source=?,status=?,version=version+1,updated_at=? WHERE id=?').run(name==='reviseChatMemory'?body.content:memory.content,name==='reviseChatMemory'?body.source:memory.source,name==='revokeChatMemory'?'revoked':'active',instant(),id)
      const value=this.memory(id,true);this.saveMemory(value);return {data:value}
    }
    if(name==='chatMemoryHistory') {
      const memory=this.memory(id)
      const rows=memory.scope==='private_agent'
        ?this.db.prepare('SELECT document FROM assistant_memory_revisions WHERE memory_id=? ORDER BY version').all(id)
        :this.db.prepare('SELECT document FROM chat_memory_revisions WHERE memory_id=? ORDER BY version').all(id)
      const revisions=rows.map(row=>ChatMemory.parse({...JSON.parse(String(row.document)),allowedActions:[]}))
      return {data:{memory,revisions}}
    }
    fail('NOT_IMPLEMENTED')
  }
}
