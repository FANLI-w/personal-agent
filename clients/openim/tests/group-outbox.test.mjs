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
function restoreFixture(item=submission){
  const values=new Map([[storageKey,JSON.stringify({version:1,memberId:'member_a',storedAt:Date.now(),items:[item],drafts:[]})]]);
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

test('image submissions persist names and receipts but never File bytes or intermediate OCR text',()=>{
  const {outbox,values}=restoreFixture();
  const images=[{id:'image_1',name:'synthetic.png',size:3,mediaType:'image/png',file:new File(['abc'],'synthetic.png',{type:'image/png'}),ocrText:'PRIVATE_SYNTHETIC_OCR'}];
  outbox.updateSubmission(submission.id,{images});
  const raw=values.get(storageKey),saved=JSON.parse(raw).items[0];
  assert.equal(saved.images.length,1);
  assert.equal(saved.images[0].file,undefined);
  assert.equal(saved.images[0].ocrText,undefined);
  assert.ok(!raw.includes('PRIVATE_SYNTHETIC_OCR'));
  assert.equal(outbox.useChatOutbox.getState().items[0].images[0].file,images[0].file);
});

test('refresh preserves a prepared image request and original key as paused, including the typed question',()=>{
  const imageRequest={route:'agentFileMessage',conversationId:'agent_chat',body:{filename:'synthetic.txt',mediaType:'text/plain',contentBase64:Buffer.from('合成图片文字').toString('base64'),text:'请比较这两张图'}};
  const queued={...submission,text:'请比较这两张图',request:imageRequest,imageAgentConversationId:'agent_chat',images:[{id:'image_1',name:'synthetic.png',size:3,mediaType:'image/png',sent:true}]};
  const {outbox}=restoreFixture(queued);
  const [restored]=outbox.useChatOutbox.getState().items;
  assert.ok(restored);
  assert.equal(restored.state,'paused');
  assert.equal(restored.id,submission.id);
  assert.equal(restored.text,queued.text);
  assert.deepEqual(restored.request,imageRequest);
  assert.equal(restored.images[0].file,undefined);
});

test('refresh preserves missing-image metadata rather than falling back to a text-only submission',()=>{
  const queued={...submission,images:[{id:'image_1',name:'synthetic.png',size:3,mediaType:'image/png',sent:false}]};
  const {outbox}=restoreFixture(queued);
  const [restored]=outbox.useChatOutbox.getState().items;
  assert.equal(restored.images[0].sent,false);
  assert.equal(restored.state,'paused');
});

test('an image-only send also survives refresh as paused instead of invalidating all pending messages',()=>{
  const queued={...submission,text:'',html:'',request:undefined,images:[{id:'image_1',name:'synthetic.png',size:3,mediaType:'image/png',sent:false}]};
  const {outbox}=restoreFixture(queued);
  const [restored]=outbox.useChatOutbox.getState().items;
  assert.ok(restored);
  assert.equal(restored.text,'');
  assert.equal(restored.images.length,1);
  assert.equal(restored.state,'paused');
});
