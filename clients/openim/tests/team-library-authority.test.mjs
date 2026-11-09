import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {fileURLToPath} from 'node:url';
import {libraryRuntime} from './helpers/team-library.mjs';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('vite'))('esbuild');
const code=(await build({entryPoints:[fileURLToPath(new URL('../electron/main/teamLibraryManage.ts',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false,external:['electron','./localDshRuntime','../main/localDshRuntime'],plugins:[{name:'isolated-authority',setup(b){b.onLoad({filter:/localFolderManage\.ts$/},()=>({contents:`export const authority=e=>{if(e.foreign)throw Error('foreign window');return{owner:e.owner,contents:e.sender}};`,loader:'js'}));b.onLoad({filter:/windowManage\.ts$/},()=>({contents:`export const getResearchServiceStatus=()=>({address:'https://synthetic.example.invalid'});`,loader:'js'}));}}]})).outputFiles[0].text;
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'acceptcat-team-authority-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 let token='synthetic_cookie_1234567890',reads=0,during=()=>{};
 const binding={url:'https://github.com/synthetic/files.git',branch:'main',workspaceId:'demo',labId:'lab_synthetic',version:1,updatedAt:new Date().toISOString(),updatedBy:'member_A'};
 const event={owner:'one',sender:{getURL:()=> 'https://synthetic.example.invalid/library',session:{cookies:{get:async()=>token?[{value:token}]:[]}}}},handlers=new Map();
 const electron={app:{getPath:()=>root},ipcMain:{handle:(n,f)=>handlers.set(n,f)},shell:{},net:{request:({url})=>{
   const req=new EventEmitter();req.setHeader=()=>{};req.abort=()=>{};req.end=()=>queueMicrotask(()=>{
     const res=new EventEmitter();res.statusCode=200;req.emit('response',res);
     if(url.endsWith('/repository'))reads++;
     if(reads===2)during();const data=url.endsWith('/session')?{member:{id:'member_A'}}:{binding:{...binding}};
     res.emit('data',Buffer.from(JSON.stringify({data})));res.emit('end');
   });return req;
 }}};
 const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:n=>n==='electron'?electron:n.endsWith('/localDshRuntime')?libraryRuntime:require(n),process,Buffer,URL,setTimeout,clearTimeout});module.exports.registerTeamLibraryBridge();
 return {event,binding,call:()=>handlers.get('team-library-cached')(event),expire:()=>token='',during:fn=>during=fn};
}
test('the native bridge refuses unverified/foreign sessions without opening another account cache',async t=>{
 const f=await fixture(t);f.event.foreign=true;await assert.rejects(f.call(),/foreign/);f.event.foreign=false;f.expire();await assert.rejects(f.call(),/登录/);
});
test('a selected lab change during an operation fences the result even when the cookie stays valid',async t=>{
 const f=await fixture(t);f.during(()=>f.binding.labId='another');await assert.rejects(f.call(),/课题组或仓库已变化/);
});
test('logout during a request rejects a late cache result',async t=>{
 const f=await fixture(t);f.during(f.expire);await assert.rejects(f.call(),/账号已变化/);
});
