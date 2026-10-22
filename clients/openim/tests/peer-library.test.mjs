import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {EventEmitter} from 'node:events';

const client=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url);
const run=path.resolve(client,'../../../.runtime/peer-library-20261023/client-tests',randomUUID());
await fs.mkdir(path.join(run,'compiled'),{recursive:true});
for(const [name,source] of [['localFolder','electron/utils/localFolder.ts'],['peerFiles','electron/utils/peerFiles.ts'],['peerProtocol','electron/utils/peerProtocol.ts'],['peer-transfer','src/research/peer-transfer.ts'],['peer-request-intent','src/research/peer-request-intent.ts']]){
 const result=ts.transpileModule(await fs.readFile(path.join(client,source),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}});
 await fs.writeFile(path.join(run,'compiled',name+'.js'),result.outputText);
}
const {PeerFileStore,safePeerFilename}=require(path.join(run,'compiled','peerFiles.js'));
const {PeerFileReceiver,sendPeerBytes}=require(path.join(run,'compiled','peer-transfer.js'));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const scope=JSON.stringify(['https://synthetic.invalid','owner','lab',1]),other=JSON.stringify(['https://synthetic.invalid','other','lab',1]);
async function fixture(){const root=path.join(run,randomUUID());await fs.mkdir(root);const files=new PeerFileStore(path.join(root,'settings')),folder=path.join(root,'shared');await fs.mkdir(folder);return {root,folder,files};}

test('only grants an explicitly configured directory; no path disclosure and no cross-account cached read',async()=>{
 const {folder,files}=await fixture();const bytes=Buffer.from('synthetic research record');await fs.writeFile(path.join(folder,'实验记录.txt'),bytes);await fs.writeFile(path.join(folder,'api_key.txt'),'private');await fs.writeFile(path.join(folder,'.hidden.txt'),'private');await fs.writeFile(path.join(folder,'run.exe'),'binary');
 await assert.rejects(files.search(scope,'request_one','记录'));
 await files.configure(scope,folder,false);const result=await files.search(scope,'request_one','记录');assert.equal(result.files.length,1);assert.equal(result.files[0].sha256,digest(bytes));assert.equal(JSON.stringify(result).includes(folder),false);
 assert.deepEqual(Buffer.from(await files.read(scope,'request_one',result.files[0].id)),bytes);
 await assert.rejects(files.read(other,'request_one',result.files[0].id));await assert.rejects(files.read(scope,'request_one','../../private'));
 assert.equal((await files.search(scope,'request_two','api_key')).files.length,0);
});
test('rejects replaced files and revokes cached selections, while keeping configuration across restart',async()=>{
 const {folder,files}=await fixture();await fs.writeFile(path.join(folder,'record.txt'),'before');await files.configure(scope,folder,true);
 const {files:[file]}=await files.search(scope,'request_one','record');await fs.writeFile(path.join(folder,'record.txt'),'after');await assert.rejects(files.read(scope,'request_one',file.id));
 const restarted=new PeerFileStore(files.directory);assert.equal((await restarted.folder(scope)).automatic,true);await assert.rejects(restarted.read(scope,'request_one',file.id));
 await files.revoke(scope);assert.equal((await files.folder(scope)).configured,false);await assert.rejects(files.read(scope,'request_one',file.id));
});
test('does not traverse a junction into an ungranted directory or reuse a previous membership directory grant',async()=>{
 const {root,folder,files}=await fixture(),outside=path.join(root,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'private.txt'),'private');await fs.symlink(outside,path.join(folder,'linked'),'junction');
 await files.configure(scope,folder,true);assert.equal((await files.search(scope,'request_one','private')).files.length,0);
 assert.equal((await files.folder(JSON.stringify(['https://synthetic.invalid','owner','lab',3]))).configured,false);
});
test('transfers bounded binary chunks, verifies exact bytes/hash and saves an immutable original locally',async()=>{
 const {files}=await fixture(),bytes=new Uint8Array(192345);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
 const file={id:'file_test',name:'论文.pdf',size:bytes.length,sha256:digest(bytes),modifiedAt:'2026-10-23T00:00:00Z'},receiver=new PeerFileReceiver(file);let received;
 const messages=[],channel={bufferedAmount:0,readyState:'open',send:data=>messages.push(typeof data==='string'?data:data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength))};
 await sendPeerBytes(channel,bytes,new AbortController().signal,()=>{});for(const message of messages){const result=await receiver.push(message);if(result)received=result;}
 assert.deepEqual(received,bytes);const saved=await files.save(scope,'request_one',file,received,'Synthetic colleague'),target=await files.receivedPath(scope,saved.id);assert.deepEqual(new Uint8Array(await fs.readFile(target)),bytes);
 assert.equal((await files.save(scope,'request_one',file,received,'Synthetic colleague')).id,saved.id);assert.equal((await files.received(scope)).length,1);
 assert.equal((await files.received(JSON.stringify(['https://synthetic.invalid','owner','different_lab',3]))).length,1);
 assert.equal((await files.received(other)).length,0);await fs.writeFile(target,'changed');await assert.rejects(files.receivedPath(scope,saved.id));
});
test('rejects extra, truncated, corrupted chunks and invalid file names instead of recording receipt',async()=>{
 const file={id:'file_test',name:'record.txt',size:3,sha256:digest(Buffer.from('abc')),modifiedAt:'2026-10-23T00:00:00Z'};
 await assert.rejects(new PeerFileReceiver(file).push('acceptcat:file:end'));
 await assert.rejects(new PeerFileReceiver(file).push(new ArrayBuffer(4)));
 const receiver=new PeerFileReceiver(file);await receiver.push(Uint8Array.from([1,2,3]).buffer);await assert.rejects(receiver.push('acceptcat:file:end'));
 for(const name of ['../record.txt','D:\\record.txt','run.exe','.env.txt','token.txt'])assert.equal(safePeerFilename(name),false);
 const {files}=await fixture();await assert.rejects(files.save(scope,'request',file,new Uint8Array(3),'colleague'));assert.equal((await files.received(scope)).length,0);
});
test('stops sending after cancellation and never emits the terminal success marker',async()=>{
 const controller=new AbortController();controller.abort();const sent=[];
 await assert.rejects(sendPeerBytes({readyState:'open',bufferedAmount:0,send:v=>sent.push(v)},new Uint8Array(20),controller.signal,()=>{}));assert.equal(sent.length,0);
 const during=new AbortController();await assert.rejects(sendPeerBytes({readyState:'open',bufferedAmount:0,send:v=>sent.push(v)},new Uint8Array(20),during.signal,()=>during.abort()));assert.equal(sent.includes('acceptcat:file:end'),false);
});
await fs.writeFile(path.join(run,'environment.json'),JSON.stringify({realFilesystem:true,realHttp:false,realWebRTC:false,realElectron:false,modelCalls:0,fixture:'synthetic bytes only'},null,2));

const {parsePeerChatRequest}=require(path.join(run,'compiled','peer-request-intent.js'));
test('routes only explicit, unambiguous colleague file requests; quotes, questions and duplicate names remain normal chat',()=>{
 const members=[{id:'B',displayName:'小王',username:'synthetic_wang'}];
 assert.deepEqual(parsePeerChatRequest('帮我找小王的实验记录',members,'device'),{deviceId:'device',providerId:'B',query:'实验记录'});
 assert.equal(parsePeerChatRequest('向synthetic_wang要论文.pdf',members,'device').query,'论文.pdf');
 for(const text of ['帮我找小王的实验记录？','比如帮我找小王的实验记录','我想讨论小王的实验记录','帮我找不存在同事的论文'])assert.equal(parsePeerChatRequest(text,members,'device'),undefined);
 assert.equal(parsePeerChatRequest('帮我找小王的实验记录',[...members,{id:'C',displayName:'小王',username:'another_wang'}],'device'),undefined);
});

test('main-process authority uses the current login and membership, rejecting forged scope and a login changed during the response',async()=>{
 const contracts=await import('@research-agent-platform/contracts'),{endpointExamples}=await import('@research-agent-platform/contracts/fixtures');
 const code=ts.transpileModule(await fs.readFile(path.join(client,'electron/main/peerLibraryAuthority.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
 const active={memberId:'member_A',labId:'lab_team'};
 const session=structuredClone(endpointExamples.session.response);Object.assign(session.data,{spaceKind:'laboratory'});Object.assign(session.data.member,{id:active.memberId,labId:active.labId});
 const roster=structuredClone(endpointExamples.labMembership.response);roster.data.members=[{id:active.memberId,username:'synthetic',displayName:'Synthetic',role:'member',version:1}];
 async function check(scope,rotate=false){
  let token='a'.repeat(64),calls=0;const headers=[];
  const contents={getURL:()=> 'http://127.0.0.1:4317/',session:{cookies:{get:async()=>[{name:'desktop_synthetic',value:token}]}}};
  const auth={owner:'window_one',contents};
  const net={request:options=>{const req=new EventEmitter(),record={url:options.url};headers.push(record);req.setHeader=(name,value)=>record[name]=value;req.abort=()=>{};req.end=()=>queueMicrotask(()=>{const response=new EventEmitter();response.statusCode=200;req.emit('response',response);queueMicrotask(()=>{response.emit('data',Buffer.from(JSON.stringify(options.url.endsWith('/session')?session:roster)));if(rotate&&++calls===2)token='b'.repeat(64);response.emit('end');});});return req;}};
  const module={exports:{}};new Function('require','module','exports',code)(name=>({electron:{net},'@research-agent-platform/contracts':contracts,'../utils/peerProtocol':require(path.join(run,'compiled','peerProtocol.js')),'./localFolderManage':{authority:()=>auth},'./windowManage':{getResearchServiceStatus:()=>({address:'https://service.synthetic.invalid/'})},'../utils/desktopServer':{desktopSessionCookie:()=> 'desktop_synthetic'}})[name],module,module.exports);
  const result=await module.exports.peerAuthority({},scope);assert.ok(headers.every(h=>h.url.startsWith('https://service.synthetic.invalid/api/v1/')&&h.Cookie==='rap_session='+'a'.repeat(64)&&h.Origin==='https://service.synthetic.invalid'));return result;
 }
 const first=await check(active);assert.equal(JSON.parse(first.key)[3],1);
 await assert.rejects(check({...active,memberId:'another_member'}));await assert.rejects(check(active,true));
 roster.data.members[0].version=3;assert.notEqual((await check(active)).key,first.key);
});
