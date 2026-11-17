import { randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect } from 'vitest'
import { routes, type RouteName } from '@research-agent-platform/contracts'
import { readConfig } from '../../src/config.js'
import { openDatabase, migrate, transaction } from '../../src/database.js'
import { createServer } from '../../src/server.js'
import { ChatService } from '../../src/chat.js'
import { ChatWorker } from '../../src/chat-worker.js'
import { serviceFor, type ModelCall, type ModelResult } from '../../src/execution-worker.js'
import { AssistantProjectWorker, createAssistantProject } from '../../src/assistant-projects.js'
import type { ProjectActionContext, ProjectCommitmentContext } from '../../src/assistant-project-actions.js'

const cleanup:(()=>unknown|Promise<unknown>)[]=[]
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn()})
export const projectModelResult=(text:string):ModelResult=>({text,failure:null,inputTokens:100,outputTokens:100,elapsedMs:10})
export async function setupAssistantProject(){
 const dir=mkdtempSync(join(tmpdir(),'assistant-project-actions-'));cleanup.push(()=>rmSync(dir,{recursive:true,force:true}))
 const master=join(dir,'master.key');writeFileSync(master,randomBytes(32).toString('hex'),{mode:0o600})
 const config=readConfig({NODE_ENV:'test',DATABASE_PATH:join(dir,'platform.sqlite'),BLOB_ROOT:join(dir,'blobs'),APP_ORIGIN:'http://127.0.0.1:4317',B3_AI_ENABLED:'1',LAB_CREDENTIAL_KEY_FILE:master})
 mkdirSync(config.blobRoot);const db=openDatabase(config.databasePath,true);cleanup.push(()=>db.close());migrate(db)
 const app=createServer(config),url=await app.listen({host:'127.0.0.1',port:0});cleanup.push(()=>app.close())
 let cookie='',csrf=''
 const call=async(name:RouteName,body:unknown=null,params:Record<string,string>={})=>{
  const route=routes[name],response=await fetch(url+route.path.replace(/\{(\w+)\}/g,(_,key:string)=>params[key]!),{method:route.method,headers:{origin:config.origin,'content-type':'application/json','idempotency-key':randomUUID(),cookie,'x-csrf-token':csrf},...(route.method==='GET'?{}:{body:JSON.stringify(body)})})
  return {status:response.status,value:await response.json() as any,cookie:response.headers.get('set-cookie')?.split(';')[0]??''}
 }
 const username='project_'+randomUUID().slice(0,8),password='12345678'
 expect((await call('register',{username,password,displayName:'合成项目负责人'})).status).toBe(201)
 const login=await call('login',{username,password});cookie=login.cookie
 csrf=(await call('session')).value.data.csrfToken
 expect((await call('createPersonalModel',{name:'Synthetic project model',provider:'deepseek',model:'deepseek-flash',enabled:true,apiKey:'synthetic-project-only'})).status).toBe(201)
 const own=(await call('personalConversation',{})).value.data
 const specialist=(await call('createPersonalAgent',{displayName:'合成方案核对助理',introduction:'核对提供的方案。',capabilityDescription:'比较方案改动及证据。',personality:'直接核对来源。'})).value.data
 const s=new ChatService(serviceFor(db,login.value.data.id,config).c,config)
 const tick=(callModel:ModelCall)=>new ChatWorker(db,config,callModel).tick()
 const send=async(text:string)=>{const response=await call('agentChatMessage',{text},{id:own.conversation.id});expect(response.status).toBe(201);return response.value.data}
 const file=async(filename:string,text:string)=>{const response=await call('agentFileMessage',{filename,mediaType:'text/plain',contentBase64:Buffer.from(text).toString('base64')},{id:own.conversation.id});expect(response.status).toBe(201);if(response.value.data.turn)await tick(async()=>projectModelResult('已按本次附件提供的文字核对。'));return response.value.data.message}
 let now=Date.now()
 const advance=()=>{now+=31000}
 const projectTick=()=>new AssistantProjectWorker(db,config,()=>now).tick()
 const create=async(fileIds:string[]=[])=>{
  const source=await send('这次项目由你持续跟进：比较方案原稿与任务说明，核对变更依据，能修正就请方案助理修正，必须我定的事情再来问。')
  await tick(async()=>projectModelResult('收到，这次以提供的材料为准。'))
  const input={title:'合成研究方案核对',goal:'比较方案原稿与任务说明并核对每项变更依据。',dueAt:null,timeZone:'Asia/Shanghai',authorizationEvidence:'这次项目由你持续跟进',sourceMessageIds:[],sourceFileMessageIds:fileIds,existingTaskIds:[],commitments:[{title:'核对方案变更理由',contactId:specialist.id,kind:'agent',instructions:'比较所选任务说明与方案原稿，指出所有变更及依据。',acceptanceCriteria:'解释为什么将方法A改为方法B；真实资料缺失需要明确区分。',dueAt:null,existingTaskId:null}]}
  const project=transaction(db,()=>createAssistantProject(s,input,{turnId:source.turn.id,conversationId:own.conversation.id,messageId:source.message.id},now))
  return {source,project}
 }
 const context=(projectId:string)=>{
  const row=db.prepare('SELECT * FROM assistant_projects WHERE id=?').get(projectId)!,doc=JSON.parse(String(row.document))
  return {...doc,id:projectId,conversationId:String(row.conversation_id),sourceMessageId:String(row.source_message_id)} as ProjectActionContext
 }
 const commitment=(projectId:string)=>{const row=db.prepare('SELECT * FROM assistant_project_commitments WHERE project_id=? ORDER BY position LIMIT 1').get(projectId)!;return {...JSON.parse(String(row.document)),id:String(row.id),turnId:row.turn_id,messageId:row.message_id} as ProjectCommitmentContext}
 return {db,config,call,own,s,specialist,tick,send,file,create,projectTick,advance,context,commitment}
}
