import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ChatHistoryDatabase} from '../electron/utils/chatHistory.ts';
const require = createRequire(import.meta.url), esbuild = createRequire(require.resolve('vite/package.json'))('esbuild');
const dir = await mkdtemp(path.join(tmpdir(), 'acceptcat-transcript-'));
const output = path.join(dir, 'reader.cjs');
await esbuild.build({stdin: {contents: `export * from './chat-message-read'; export * from './chat-record-cache'; export * from './chat-transcript-sync';`, resolveDir: fileURLToPath(new URL('../src/research', import.meta.url)),loader: 'ts'}, outfile: output, bundle:true,platform:'node',format:'cjs',plugins:[{name:'synthetic-account',setup(build){
  build.onResolve({filter:/^\.\/(api|store)$/}, args=>({path:args.path,namespace:'fixture'}));
  build.onResolve({filter:/chat-history-cache$/},()=>({path:'lease',namespace:'fixture'}));
  build.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='lease'?`export const currentLease=async()=> 'synthetic-lease';export const forgetLease=()=>{};export const reportHistoryCacheFailure=failed=>globalThis.transcriptFixture.cacheFailures.push(failed);`:args.path==='./api'?`export class ResearchApiError extends Error{constructor(code,status){super(code);this.code=code;this.status=status;}}export const researchApi=(...args)=>globalThis.transcriptFixture.api(...args);export const supportsTranscriptSync=()=>globalThis.transcriptFixture.supported;`:`export const useResearchStore={getState:()=>globalThis.transcriptFixture.state};`}));
}}]});
const fact = (id='m1', sequence=1) => ({id,conversationId:'group',sequence,senderContactId:null,origin:'model',text:'Synthetic full answer',mentions:[],resources:[],actionIds:[],turnId:null,createdAt:'2026-11-04T00:00:00Z'});
const detail = () => ({message:fact(),withdrawn:false,version:1,allowedActions:[],replyTo:{messageId:'source',sequence:1,senderContactId:null,text:'Synthetic quoted question',withdrawn:false}});
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(),'acceptcat-transcript-db-'));
  let db = new ChatHistoryDatabase(root,'https://synthetic.example','A');
  const state={generation:1};
  globalThis.transcriptFixture={state,supported:true,cacheFailures:[],api: async()=>({data:detail()})};
  globalThis.window={electronAPI:{chatHistory:{readRecord:async(_lease,...args)=>db.readRecord(...args),saveRecord:async(_lease,...args)=>db.saveRecord(...args),removeRecord:async(_lease,...args)=>db.removeRecord(...args)}}};
  globalThis.document={visibilityState:'visible'};
  Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
  const load=()=>{delete require.cache[output];return require(output);};
  t.after(async()=>{db.close();await rm(root,{recursive:true,force:true});});
  return {state,load,get db(){return db;},switchAccount(member){db.close();db=new ChatHistoryDatabase(root,'https://synthetic.example',member);state.generation++;},restart(){db.close();db=new ChatHistoryDatabase(root,'https://synthetic.example','A');return load();}};
}
test('read once, restart, then offline: full body and quote use SQLite with zero API calls', async t=>{
  const f=await fixture(t), reader=f.load();let requests=0;
  transcriptFixture.api=async()=>{requests++;return {data:detail()};};
  await reader.readChatMessage('group','m1',1);
  const restarted=f.restart();requests=0;
  transcriptFixture.api=async()=>{requests++;throw new Error('offline');};
  const local=await restarted.readChatMessage('group','m1',1);
  assert.equal(local.fact.text,'Synthetic full answer');assert.equal(local.details.replyTo.text,'Synthetic quoted question');assert.equal(requests,0);
});
test('overlapping message and quote cache misses share one network read', async t=>{
  const f=await fixture(t),reader=f.load();let requests=0;
  transcriptFixture.api=async()=>{requests++;await new Promise(r=>setImmediate(r));return {data:detail()};};
  const values=await Promise.all(Array.from({length:12},()=>reader.readChatMessage('group','m1',1)));
  assert.equal(requests,1);assert.ok(values.every(value=>value.fact.text==='Synthetic full answer'));
});
test('account switch never reads another transcript or saves its late body into the next account', async t=>{
  const f=await fixture(t),reader=f.load();let finish;
  transcriptFixture.api=()=>new Promise(resolve=>{finish=resolve;});
  const pending=reader.readChatMessage('group','m1',1);await new Promise(r=>setImmediate(r));
  f.switchAccount('B');finish({data:detail()});
  await assert.rejects(pending,/聊天账号或消息已变化/);
  assert.equal(f.db.readRecord('group','message','m1'),null);
  transcriptFixture.api=async()=>{throw new Error('no B authority');};
  await assert.rejects(reader.readChatMessage('group','m1',1),/no B authority/);
});
test('withdrawal wins over a late pre-withdrawal read and remains after restart', async t=>{
  const f=await fixture(t),reader=f.load();let finish;
  transcriptFixture.api=()=>new Promise(resolve=>{finish=resolve;});
  const pending=reader.readChatMessage('group','m1',1);await new Promise(r=>setImmediate(r));
  const tombstone={...detail(),message:{...fact(),text:'这条消息已撤回'},withdrawn:true,version:2,replyTo:null};
  await reader.saveTranscriptSnapshot('group',{details:tombstone,requests:[],turns:[],revision:'a'.repeat(64)},1);
  finish({data:detail()});await assert.rejects(pending,/聊天账号或消息已变化/);
  const restarted=f.restart();transcriptFixture.api=async()=>{throw new Error('offline');};
  assert.equal((await restarted.readChatMessage('group','m1',1)).details.withdrawn,true);
});
test('temporary sync failure preserves cached content; confirmed loss of authority removes it without a retry loop', async t=>{
  const f=await fixture(t),reader=f.load();await reader.readChatMessage('group','m1',1);
  transcriptFixture.api=async()=>{throw new Error('synthetic temporary outage');};
  await assert.rejects(reader.readChatMessage('group','m1',1,undefined,true),/temporary outage/);
  assert.equal((await reader.readChatMessage('group','m1',1)).fact.text,'Synthetic full answer');
  await reader.dropChatRecord('group','message','m1');
  let calls=0;transcriptFixture.api=async()=>{calls++;return {data:detail()};};
  await assert.rejects(reader.readChatMessage('group','m1',1),/当前无法读取/);
  assert.equal(calls,0);assert.equal(f.db.readRecord('group','message','m1'),null);
  await reader.saveTranscriptSnapshot('group',{details:detail(),requests:[],turns:[],revision:'b'.repeat(64)},1);
  assert.equal((await reader.readChatMessage('group','m1',1)).fact.text,'Synthetic full answer');
});

test('a failed disk write is reported instead of silently claiming persistent history',async t=>{
  const f=await fixture(t),reader=f.load();
  const save=window.electronAPI.chatHistory.saveRecord;
  window.electronAPI.chatHistory.saveRecord=async()=>{throw Error('synthetic disk failure');};
  assert.equal((await reader.readChatMessage('group','m1',1)).fact.text,'Synthetic full answer');
  assert.equal(f.db.readRecord('group','message','m1'),null);
  window.electronAPI.chatHistory.saveRecord=save;
  assert.ok(transcriptFixture.cacheFailures.includes(true));
  await reader.readChatMessage('group','m1',1,undefined,true);
  assert.equal(f.db.readRecord('group','message','m1').fact.text,'Synthetic full answer');
  assert.equal(transcriptFixture.cacheFailures.at(-1),false);
});

test('an atomic snapshot restores completed Agent receipts after restart without any private turn request',async t=>{
  const f=await fixture(t),reader=f.load();
  const turn={id:'turn',conversationId:'group',inputMessageId:'source',agentContactId:'agent',status:'succeeded',failure:null,availability:{status:'available',reason:null},outputMessageId:'m1',usage:null,budget:{maxTokens:4000,maxSeconds:90},remainingBudget:null,allowedActions:[],version:2,createdAt:'2026-11-04T00:00:00Z',updatedAt:'2026-11-04T00:00:01Z'};
  const details={...detail(),message:{...fact('m1',2),turnId:'turn'}};
  await reader.saveTranscriptSnapshot('group',{details,requests:[],turns:[turn],revision:'c'.repeat(64)},1);
  await reader.saveTranscriptSnapshot('group',{details:{...detail(),message:{...fact('source',1),origin:'human',turnId:'turn'},replyTo:null},requests:[],turns:[turn],revision:'d'.repeat(64)},1);
  f.db.removeRecord('group','turn','turn');f.db.removeRecord('group','group-status','m1');
  const restarted=f.restart();let calls=0;transcriptFixture.api=async()=>{calls++;throw Error('offline');};
  await restarted.readChatMessage('group','m1',2);
  assert.equal((await restarted.readChatTurn('group','turn')).data.status,'succeeded');
  assert.deepEqual((await restarted.readGroupStatuses('group','m1')).data.requests,[]);
  assert.equal(calls,0);
  const retried={...turn,id:'retried-turn',status:'queued',version:1};
  await restarted.cacheChatTurnResult(retried,1,true);
  const afterRetry=f.restart();
  assert.equal((await afterRetry.readChatMessage('group','source',1)).fact.turnId,'retried-turn');
  assert.equal((await afterRetry.readChatMessage('group','m1',2)).fact.turnId,'turn');
  assert.equal((await afterRetry.readChatTurn('group','retried-turn')).data.status,'queued');
  assert.equal(calls,0);
});
