import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require=createRequire(import.meta.url);
const esbuild=createRequire(require.resolve('vite/package.json'))('esbuild');
const directory=await mkdtemp(path.join(tmpdir(),'group-outbox-'));
const output=path.join(directory,'outbox.cjs');
await esbuild.build({
  entryPoints:[fileURLToPath(new URL('../src/research/chat-outbox.ts',import.meta.url))],
  outfile:output,bundle:true,format:'cjs',platform:'node',
  plugins:[{name:'synthetic-actor',setup(build){
    build.onResolve({filter:/^\.\/store$/},()=>({path:'actor',namespace:'synthetic'}));
    build.onLoad({filter:/.*/,namespace:'synthetic'},()=>({contents:'export const useResearchStore = globalThis.__groupActorStore;'}));
  }}],
});
const body={text:'@甲 @乙 你好',mentions:[{contactId:'agent_a',start:0,end:2},{contactId:'agent_b',start:3,end:5}],intent:'ask_agent',agentContactIds:['agent_a','agent_b'],budget:{maxTokens:32000,maxSeconds:180},context:[]};
const submission={id:'same_request_key_123',conversationID:'im_group',recvID:'',groupID:'group',text:body.text,html:body.text,request:{route:'sendChatMessage',conversationId:'group_chat',body},state:'sending',generation:1};
const storageKey='research-chat-pending-v1';
function restoreFixture(){
  const values=new Map([[storageKey,JSON.stringify({version:1,memberId:'member_a',storedAt:Date.now(),items:[submission],drafts:[]})]]);
  globalThis.sessionStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  let actor={generation:7,sessionActorId:'member_a',actor:{member:{id:'member_a'}}};
  const listeners=[];
  globalThis.__groupActorStore={getState:()=>actor,subscribe:listener=>listeners.push(listener)};
  delete require.cache[output];
  const outbox=require(output);
  return {outbox,values,switchActor(next){const previous=actor;actor=next;for(const listener of listeners)listener(next,previous)}};
}

test('refresh restores the entire multi-Agent request as paused, retaining its aggregate budget and original idempotency key',()=>{
  const {outbox,values}=restoreFixture();
  const [restored]=outbox.useChatOutbox.getState().items;
  assert.equal(restored.state,'paused');assert.equal(restored.generation,7);
  assert.equal(restored.id,submission.id);assert.deepEqual(restored.request,submission.request);
  outbox.updateSubmission(restored.id,{state:'failed',error:'合成断线'});
  const saved=JSON.parse(values.get(storageKey));
  assert.deepEqual(saved.items[0].request.body.agentContactIds,['agent_a','agent_b']);
  assert.deepEqual(saved.items[0].request.body.budget,{maxTokens:32000,maxSeconds:180});
});
test('switching accounts removes the old group batch instead of sending or restoring it for the new actor',()=>{
  const {outbox,values,switchActor}=restoreFixture();
  switchActor({generation:8,sessionActorId:'member_b',actor:{member:{id:'member_b'}}});
  assert.deepEqual(outbox.useChatOutbox.getState().items,[]);
  const persisted=values.get(storageKey);
  assert.ok(!persisted || JSON.parse(persisted).items.length===0);
});
