import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const esbuild=createRequire(require.resolve('vite/package.json'))('esbuild');
const output=path.join(await mkdtemp(path.join(tmpdir(),'chat-message-compat-')),'read.cjs');
await esbuild.build({stdin:{contents:`export * from './chat-message-read'; export {ResearchApiError} from './api';`,resolveDir:fileURLToPath(new URL('../src/research',import.meta.url)),loader:'ts'},outfile:output,bundle:true,platform:'node',format:'cjs',plugins:[{name:'synthetic-read',setup(build){
 build.onResolve({filter:/^\.\/(api|store)$/},args=>({path:args.path,namespace:'fixture'}));
 build.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='./api'?`export class ResearchApiError extends Error {constructor(status){super('synthetic error');this.status=status;}} export const researchApi=(name,options)=>globalThis.chatReadFixture.api(name,options);`:`export const useResearchStore={getState:()=>globalThis.chatReadFixture.state};`}));
}}]});
function load(api){globalThis.chatReadFixture={state:{generation:1},api};delete require.cache[output];return require(output);}
const fact={id:'message',sequence:3,text:'authorized text'};
test('old backend fallback preserves text and only disables metadata after a successful legacy read',async()=>{
 const calls=[];let reader;
 reader=load(async(name)=>{calls.push(name);if(name==='chatMessageDetails')throw new reader.ResearchApiError(404);return {data:[fact]};});
 assert.deepEqual(await reader.readChatMessage('group','message',3),{fact,details:undefined});
 assert.equal(reader.hasMessageDetails(),false);
 await reader.readChatMessage('group','message',3);
 assert.deepEqual(calls,['chatMessageDetails','chatMessages','chatMessages']);
});
test('authorization failure never falls back to stale text or marks a current backend unsupported',async()=>{
 let reader,calls=0;
 reader=load(async()=>{calls++;throw new reader.ResearchApiError(403);});
 await assert.rejects(reader.readChatMessage('group','message',3),e=>e.status===403);
 assert.equal(calls,1);
 globalThis.chatReadFixture.api=async()=>({data:{message:fact,withdrawn:false,version:1,allowedActions:[],replyTo:null}});
 await reader.readChatMessage('group','message',3);
 assert.equal(reader.hasMessageDetails(),true);
});
test('a late metadata response cannot enable a newer account generation',async()=>{
 let resolve;const reader=load(()=>new Promise(r=>{resolve=r;}));
 const pending=reader.readChatMessage('group','message',3);
 globalThis.chatReadFixture.state={generation:2};
 resolve({data:{message:fact,withdrawn:false,version:1,allowedActions:[],replyTo:null}});
 await pending;
 assert.ok(!reader.hasMessageDetails());
});
