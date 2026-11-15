import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {fileURLToPath} from 'node:url';
import {libraryRuntime,libraryFixture} from './helpers/team-library.mjs';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('vite'))('esbuild');
const code=(await build({entryPoints:[fileURLToPath(new URL('../electron/main/teamLibraryManage.ts',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false,external:['electron','./localDshRuntime','../main/localDshRuntime'],plugins:[{name:'isolated-authority',setup(b){b.onLoad({filter:/localFolderManage\.ts$/},()=>({contents:`export const authority=e=>{if(e.foreign)throw Error('foreign window');return{owner:e.owner,contents:e.sender}};`,loader:'js'}));b.onLoad({filter:/windowManage\.ts$/},()=>({contents:`export const getResearchServiceStatus=()=>({address:'https://synthetic.example.invalid'});`,loader:'js'}));}}]})).outputFiles[0].text;
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'acceptcat-team-authority-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 let token='synthetic_cookie_1234567890',reads=0,during=()=>{},canConfigure=false;
 let discovery=async(_root,url,previous)=>({url,branch:'main',workspaceId:previous.workspaceId});
 const binding={url:'https://github.com/synthetic/files.git',branch:'main',workspaceId:'demo',labId:'lab_synthetic',version:1,updatedAt:new Date().toISOString(),updatedBy:'member_A'};
 const event={owner:'one',sender:{getURL:()=> 'https://synthetic.example.invalid/library',session:{cookies:{get:async()=>token?[{value:token}]:[]}}}},handlers=new Map();
 const electron={app:{getPath:()=>root},ipcMain:{handle:(n,f)=>handlers.set(n,f)},shell:{},net:{request:({url})=>{
   const req=new EventEmitter();req.setHeader=()=>{};req.abort=()=>{};req.end=()=>queueMicrotask(()=>{
     const res=new EventEmitter();res.statusCode=200;req.emit('response',res);
     if(url.endsWith('/repository'))reads++;
     if(reads===2)during();const data=url.endsWith('/session')?{member:{id:'member_A'}}:{binding:{...binding},canConfigure};
     res.emit('data',Buffer.from(JSON.stringify({data})));res.emit('end');
   });return req;
 }}};
 const syntheticGit = (...args) => {
   const proc = spawn(...args);
   if (args[0] === 'git') {
     let diagnostic = '';
     proc.stderr.on('data', chunk => { diagnostic += chunk.toString(); });
     proc.on('close', status => {
       if (status) t.diagnostic('Fixture Git ' + args[1].slice(args[1].findIndex(s=>s.startsWith('--git-dir='))+1, -1).join(' ') + ' failed: ' + diagnostic.replace(/https?:\/\/\S+/g, '[url]').slice(0,500));
     });
   }
   return proc;
 };
 const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:n=>n==='node:child_process'?{...require(n),spawn:syntheticGit}:n==='electron'?electron:n.endsWith('/localDshRuntime')?libraryRuntime:require(n),process,Buffer,URL,setTimeout,clearTimeout});module.exports.registerTeamLibraryBridge((...args)=>discovery(...args));
 return {event,binding,context:()=>module.exports.teamLibraryContext(event),previewPath:s=>handlers.get('team-library-preview-path')(event,s),call:()=>handlers.get('team-library-cached')(event),discover:()=>handlers.get('team-library-discover')(event,'https://github.com/synthetic/files'),expire:()=>token='',during:fn=>during=fn,manager:()=>canConfigure=true,discoverWith:fn=>discovery=fn};
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

test('repository discovery also refuses foreign, logged-out and non-manager callers before Git',async t=>{
 const f=await fixture(t);f.event.foreign=true;await assert.rejects(f.discover(),/foreign/);
 f.event.foreign=false;await assert.rejects(f.discover(),/负责人/);
 f.expire();await assert.rejects(f.discover(),/登录/);
});

test('discovery returns only after rechecking manager permission and the current binding',async t=>{
 const f=await fixture(t);f.manager();assert.equal((await f.discover()).workspaceId,'demo');
 const changed=await fixture(t);changed.manager();changed.during(()=>changed.binding.labId='another');
 await assert.rejects(changed.discover(),/课题组、权限或仓库已变化/);
 const logout=await fixture(t);logout.manager();logout.discoverWith(async()=>{logout.expire();return {url:logout.binding.url,branch:'main',workspaceId:'demo'};});
 await assert.rejects(logout.discover(),/账号已变化/);
});

test('path preview returns bounded text, images and generic files from the accepted Git revision',async t=>{
 const g=await libraryFixture(t);
 for(const [name,body] of [['notes.md','a'.repeat(200001)],['figure.png',Buffer.from([137,80,78,71])],['draft.docx',Buffer.from([80,75,3,4])]])
  await fs.writeFile(path.join(g.work,name),body);
 g.git(['add','.']);g.git(['commit','-m','Synthetic preview files']);g.git(['push',g.remote,'main']);
 const snapshot=await g.store.sync(),f=await fixture(t),context=await f.context();
 await fs.mkdir(context.store.directory,{recursive:true});
 // Exercise the IPC reader against the same fetched Git objects used by the store.
 await fs.cp(path.join(g.store.directory,'objects.git'),path.join(context.store.directory,'objects.git'),{recursive:true});
 await fs.writeFile(path.join(context.store.directory,'snapshot.json'),JSON.stringify({...snapshot,manifest:{...snapshot.manifest,workspaceId:f.binding.workspaceId}}));
 const selected=name=>({revision:snapshot.revision,path:name});
 const text=await f.previewPath(selected('notes.md'));
 assert.equal(text.kind,'text');assert.equal(text.text.length,200000);assert.equal(text.truncated,true);
 const image=await f.previewPath(selected('figure.png'));
 assert.equal(image.kind,'image');assert.equal(image.dataUrl,'data:image/png;base64,iVBORw==');
 const file=await f.previewPath(selected('draft.docx'));
 assert.equal(file.kind,'file');assert.equal(file.name,'draft.docx');assert.equal(file.size,4);
 await assert.rejects(f.previewPath({...selected('notes.md'),revision:'0'.repeat(40)}),/版本已变化/);
 f.event.foreign=true;await assert.rejects(f.previewPath(selected('notes.md')),/foreign/);
 f.event.foreign=false;f.expire();await assert.rejects(f.previewPath(selected('notes.md')),/登录/);
});
