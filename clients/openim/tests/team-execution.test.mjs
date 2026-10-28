import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {buildLocalDshRuntime} from '../../../integrations/deepseek-harness/desktop/build.mjs';
const module={exports:{}};
vm.runInNewContext(buildLocalDshRuntime(fileURLToPath(new URL('../',import.meta.url))).outputFiles[0].text,{module,exports:module.exports,require:createRequire(import.meta.url),process,Buffer,URL,setTimeout,clearTimeout,setInterval,clearInterval});
const {DshTaskWorkspace,TeamExecution}=module.exports;
const target={kind:'research',taskId:'synthetic_task',title:'Literature',goal:'Cite the fixture sources',version:1};
const inputs={fingerprint:'original',entries:[],omitted:[]};
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'acceptcat-team-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const sessions=new Set(),events=[],requests=new Set();let running=false,execution=null,deny=false,lose=false,cancels=0,prompts=0;
 const rpc=async(method,args)=>{
  if(method==='workspace/create')return {workspace:{workspaceId:'workspace'}};
  if(method==='session/create'){sessions.add(args.sessionId);return {sessionId:args.sessionId};}
  if(method==='session/projections')return sessions.has(args.sessionId)?{kind:'sequenced',asOfSeq:events.at(-1)?.seq||0}:null;
  if(method==='session/page')return {records:events.map(event=>({event})),hasMore:false};
  if(method==='session/list')return {items:[...sessions].map(sessionId=>({sessionId,running}))};
  if(method==='session/prompt'){if(!requests.has(args.requestId)){requests.add(args.requestId);prompts++;}if(lose){lose=false;throw Error('lost acknowledgement');}return {};}
  if(method==='session/cancel'){cancels++;return {};}
  return {};
 };
 const business=async(url,body)=>{
  if(url.endsWith('heartbeat'))return {};
  if(!body)return {execution,team:{}};
  if(url.endsWith('/claim')){
   if(execution?.requestId===body.requestId)return execution;
   if(execution&&['claimed','running','uncertain'].includes(execution.phase))throw Error('occupied');
   execution={id:'execution_'+body.requestId,deviceId:body.deviceId,requestId:body.requestId,phase:'claimed',deadlineAt:new Date(Date.now()+180000).toISOString()};return execution;
  }
  if(deny&&body.phase==='running')throw Error('permission revoked');
  execution={...execution,phase:body.phase};return execution;
 };
 const store=new DshTaskWorkspace(root,rpc,async()=>{});await store.open(target);
 const make=()=>{const c=new TeamExecution(store,business,async()=>{});t.after(()=>c.dispose());return c;};
 const coordinator=make();await coordinator.start();coordinator.dispose();
 return {root,store,coordinator,make,events,execution:()=>execution,prompts:()=>prompts,cancels:()=>cancels,deny:()=>deny=true,lose:()=>lose=true,running:v=>running=v,expire:()=>execution.deadlineAt='2020-01-01T00:00:00.000Z'};
}
test('queue acknowledgement and an older completion never release the execution lock',async t=>{
 const f=await fixture(t);f.events.push({seq:1,type:'turn/end',data:{reason:{kind:'completed'}}});
 await f.coordinator.prompt(target,'Compare sources','request_one',inputs);await f.coordinator.tick();assert.equal(f.execution().phase,'running');
 await assert.rejects(f.coordinator.prompt(target,'New intent','request_two',inputs),/occupied/);
 f.events.push({seq:2,type:'turn/start',data:{}},{seq:3,type:'turn/end',data:{reason:{kind:'completed'}}});
 await f.coordinator.tick();assert.equal(f.execution().phase,'finished');
 await f.coordinator.prompt(target,'Compare sources','request_one',inputs);assert.equal(f.prompts(),1);
});
test('lost prompt response and application restart retain the same request and identity',async t=>{
 const f=await fixture(t),id=(await f.store.load(target)).deviceId;f.lose();
 await assert.rejects(f.coordinator.prompt(target,'Compare sources','request_lost',inputs),/lost/);assert.equal(f.execution().phase,'uncertain');
 const restarted=f.make();await restarted.start();restarted.dispose();
 await restarted.prompt(target,'Compare sources','request_lost',inputs);assert.equal(f.prompts(),1);assert.equal((await f.store.load(target)).deviceId,id);
 f.events.push({seq:1,type:'turn/end',data:{reason:{kind:'completed'}}});await restarted.tick();assert.equal(f.execution().phase,'finished');
});
test('revocation or deadline requests local cancellation and keeps uncertain until terminal evidence',async t=>{
 const f=await fixture(t);await f.coordinator.prompt(target,'Compare sources','request_cancel',inputs);f.running(true);f.deny();
 await f.coordinator.tick();assert.equal(f.cancels(),1);assert.equal(f.execution().phase,'uncertain');
 f.expire();await f.coordinator.tick();assert.equal(f.execution().phase,'uncertain');
 f.running(false);f.events.push({seq:1,type:'turn/end',data:{reason:{kind:'aborted'}}});await f.coordinator.tick();assert.equal(f.execution().phase,'stopped');
});
test('different installations use different persistent device identities',async t=>{
 const a=await fixture(t),b=await fixture(t);assert.notEqual((await a.store.load(target)).deviceId,(await b.store.load(target)).deviceId);
 assert.equal((await a.store.open({...target,taskId:'another_task'})).deviceId,(await a.store.load(target)).deviceId);
});
test('an already running unmanaged local session cannot reserve a new server execution',async t=>{
 const f=await fixture(t);f.running(true);
 await assert.rejects(f.coordinator.prompt(target,'Compare sources','request_occupied',inputs),/已有运行/);
 assert.equal(f.execution(),null);assert.equal(f.prompts(),0);
});
