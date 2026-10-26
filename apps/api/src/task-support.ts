import type { DatabaseSync } from 'node:sqlite'
import { Task } from '@research-agent-platform/contracts'
import type { Conversation } from '@research-agent-platform/contracts'
import { transaction } from './database.js'
import { ChatService } from './chat.js'
import { serviceFor } from './execution-worker.js'
import { hasLabMembership } from './lab-access.js'
import type { Config } from './config.js'

// Consume only the new explicit support requests. Historical notification kinds
// remain dormant; an upgrade must never broadcast the old task outbox.
export class TaskSupportWorker {
  constructor(readonly db: DatabaseSync, readonly config: Config) {}
  async tick() { return transaction(this.db,()=>{
    const row=this.db.prepare("SELECT * FROM outbox WHERE kind='support_requested' AND status='pending' AND available_at<=? ORDER BY rowid LIMIT 1").get(new Date().toISOString())
    if(!row)return false
    const payload=JSON.parse(String(row.payload_json)) as {taskId:string;labId:string;requestedBy:string}
    const saved=this.db.prepare('SELECT document FROM tasks WHERE id=?').get(payload.taskId)
    const task=saved?Task.parse(JSON.parse(String(saved.document))):null
    const target=task?.blocker?.requestedMemberId
    const active=(id:string)=>this.db.prepare('SELECT 1 FROM auth_accounts WHERE member_id=? AND disabled=0').get(id)
    const permitted=task&&task.status==='blocked'&&task.version===row.aggregate_version&&task.labId===payload.labId
      &&task.leadId===payload.requestedBy&&target&&active(target)&&active(payload.requestedBy)
      &&hasLabMembership(this.db,target,payload.labId)&&hasLabMembership(this.db,payload.requestedBy,payload.labId)
      &&this.db.prepare("SELECT 1 FROM task_access WHERE task_id=? AND member_id=? AND access='full'").get(task.id,payload.requestedBy)
      &&!this.db.prepare("SELECT 1 FROM task_access WHERE task_id=? AND member_id=? AND access='revoked'").get(task.id,target)
    if(!permitted){this.db.prepare("UPDATE outbox SET status='cancelled' WHERE id=?").run(row.id!);return true}
    const chat=new ChatService(serviceFor(this.db,target,this.config).c,this.config)
    chat.ensureContacts()
    const {data}=chat.handle('personalConversation',{params:{},query:{},headers:{},body:{}}) as {data:{conversation:Conversation;agent:{id:string}}}
    const requester=this.db.prepare('SELECT display_name FROM members WHERE id=?').get(payload.requestedBy)!
    // The lead explicitly directs this action to the member. Do not copy the
    // private task title, goal, materials, history or a task resource reference.
    chat.message(data.conversation.id,{senderContactId:data.agent.id,origin:'service',text:`${requester.display_name}需要你帮忙：\n${task.blocker!.requestedAction}\n\n可以联系对方沟通。这条请求不会自动把任务分配给你。`,mentions:[],resources:[],actionIds:[],turnId:null})
    this.db.prepare("UPDATE outbox SET status='delivered',attempts=attempts+1 WHERE id=?").run(row.id!)
    return true
  }) }
}
