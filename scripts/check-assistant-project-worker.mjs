// Explicit local smoke only: compiled worker, synthetic temporary account/data.
// Usage: node scripts/check-assistant-project-worker.mjs --run <evidence.json>
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import assert from 'node:assert/strict'
import { readConfig } from '../apps/api/dist/config.js'
import { openDatabase, migrate, transaction } from '../apps/api/dist/database.js'
import { createServer } from '../apps/api/dist/server.js'
import { ChatService } from '../apps/api/dist/chat.js'
import { ChatWorker } from '../apps/api/dist/chat-worker.js'
import { serviceFor } from '../apps/api/dist/execution-worker.js'
import { createAssistantProject } from '../apps/api/dist/assistant-projects.js'
import { routes } from '../packages/contracts/dist/index.js'

if(process.argv[2]!=='--run')throw new Error('Opt in with --run and an evidence JSON destination; no production database is accepted.')
const evidencePath=resolve(process.argv[3]??join(tmpdir(),'assistant-project-wallclock-smoke.json'))
const directory=mkdtempSync(join(tmpdir(),'assistant-project-worker-smoke-'))
const master=join(directory,'synthetic.key');writeFileSync(master,randomBytes(32).toString('hex'),{mode:0o600})
const env={...process.env,NODE_ENV:'test',DATABASE_PATH:join(directory,'platform.sqlite'),BLOB_ROOT:join(directory,'blobs'),APP_ORIGIN:'http://127.0.0.1:4317',B3_AI_ENABLED:'1',LAB_CREDENTIAL_KEY_FILE:master,OPENIM_ENABLED:'0'}
const config=readConfig(env);mkdirSync(config.blobRoot)
const db=openDatabase(config.databasePath,true);migrate(db)
const app=createServer(config),children=[],logs=[]
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
let cookie='',csrf=''
const call=async(name,body=null,params={})=>{
 const route=routes[name],response=await app.inject({method:route.method,url:route.path.replace(/\{(\w+)\}/g,(_,key)=>params[key]),headers:{origin:config.origin,'content-type':'application/json','idempotency-key':randomUUID(),cookie,'x-csrf-token':csrf},...(route.method==='GET'?{}:{payload:JSON.stringify(body)})})
 assert.ok(response.statusCode<300,`${name}: ${response.statusCode} ${response.body}`)
 return {value:response.json(),cookie:String(response.headers['set-cookie']??'').split(';')[0]}
}
const start=()=>{
 const child=spawn(process.execPath,[resolve('apps/api/dist/worker.js')],{cwd:resolve('.'),env,windowsHide:true,stdio:['ignore','pipe','pipe']})
 children.push(child);child.stdout.on('data',data=>logs.push({stream:'stdout',text:data.toString()}));child.stderr.on('data',data=>logs.push({stream:'stderr',text:data.toString()}))
 return child
}
const stop=async child=>{if(child.exitCode===null&&!child.killed){const exited=once(child,'exit');child.kill('SIGTERM');await exited}}
const report={kind:'synthetic-wallclock-worker-smoke',startedAt:new Date().toISOString(),compiledWorker:resolve('apps/api/dist/worker.js'),productionTouched:false,liveModelUsed:false,workerStarts:0,success:false}
try{
 const username='wallclock_'+randomUUID().slice(0,8),password='12345678'
 await call('register',{username,password,displayName:'合成定时检查负责人'})
 const login=await call('login',{username,password});cookie=login.cookie;csrf=(await call('session')).value.data.csrfToken
 await call('createPersonalModel',{name:'Synthetic only',provider:'deepseek',model:'deepseek-flash',enabled:true,apiKey:'synthetic-never-sent'})
 const own=(await call('personalConversation',{})).value.data
 const source=(await call('agentChatMessage',{text:'请持续跟进这个合成项目，到截止时间核实我的交付，缺少材料再问我。'},{id:own.conversation.id})).value.data
 // Only fixture preparation invokes a synthetic callback; child processes have
 // no queued model turns and no external credentials.
 await new ChatWorker(db,config,async()=>({text:'按本次说明跟进。',failure:null,inputTokens:100,outputTokens:100,elapsedMs:5})).tick()
 db.prepare('DELETE FROM assistant_feedback').run()
 const s=new ChatService(serviceFor(db,login.value.data.id,config).c,config),dueAt=new Date(Date.now()+5000).toISOString()
 const project=transaction(db,()=>createAssistantProject(s,{title:'合成墙钟交付检查',goal:'核实合成负责人是否提供真实交付。',dueAt,timeZone:'Asia/Shanghai',authorizationEvidence:'请持续跟进这个合成项目',commitments:[{title:'负责人原稿',kind:'human',contactId:s.human().id,instructions:'等待负责人实际提供原稿。',acceptanceCriteria:'必须有真实原稿，不能把到期视为完成。',dueAt,existingTaskId:null}]},{turnId:source.turn.id,conversationId:own.conversation.id,messageId:source.message.id}))
 const messagesAtStart=Number(db.prepare('SELECT count(*) n FROM chat_messages').get().n)
 const first=start();report.workerStarts++;await delay(1300);await stop(first)
 report.firstStoppedAt=new Date().toISOString()
 const second=start();report.workerStarts++
 let event
 for(let poll=0;poll<80;poll++){
  event=db.prepare("SELECT * FROM assistant_project_events WHERE project_id=? AND kind='decision' ORDER BY created_at LIMIT 1").get(project.id)
  if(event)break
  assert.equal(second.exitCode,null,`Worker exited: ${JSON.stringify(logs)}`)
  await delay(200)
 }
 assert.ok(event,'No due decision received within wall-clock timeout')
 report.scheduledAt=dueAt;report.recordedAt=String(event.created_at);report.latencyMs=Date.parse(String(event.created_at))-Date.parse(dueAt)
 assert.ok(report.latencyMs>=0&&report.latencyMs<15000)
 await delay(1500);await stop(second)
 const third=start();report.workerStarts++;await delay(1800);await stop(third)
 const decisionCount=Number(db.prepare("SELECT count(*) n FROM assistant_project_events WHERE project_id=? AND kind='decision'").get(project.id).n)
 const message=db.prepare('SELECT conversation_id,document FROM chat_messages WHERE id=?').get(event.message_id)
 assert.equal(decisionCount,1);assert.equal(message.conversation_id,own.conversation.id)
 assert.equal(db.prepare('SELECT status FROM personal_work_tasks WHERE id=?').get(project.workTaskId).status,'active')
 assert.equal(Number(db.prepare('SELECT count(*) n FROM chat_messages').get().n),messagesAtStart+1)
 report.decisionCount=decisionCount;report.originalChatReceived=true;report.taskAccepted=false;report.zeroUserMessagesAfterScheduling=true;report.outputText=JSON.parse(String(message.document)).text;report.success=true
}catch(error){report.failure=error instanceof Error?error.message:String(error);process.exitCode=1}
finally{
 for(const child of children)await stop(child)
 report.finishedAt=new Date().toISOString();report.workerLogs=logs
 mkdirSync(dirname(evidencePath),{recursive:true});writeFileSync(evidencePath,JSON.stringify(report,null,2)+'\n')
 await app.close();db.close();rmSync(directory,{recursive:true,force:true})
 console.log(JSON.stringify({success:report.success,evidencePath,latencyMs:report.latencyMs,decisionCount:report.decisionCount,workerStarts:report.workerStarts,failure:report.failure}))
}
