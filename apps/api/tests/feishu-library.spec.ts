import { randomBytes,randomUUID } from 'node:crypto'
import { mkdtempSync,mkdirSync,writeFileSync,rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach,it,expect } from 'vitest'
import { routes,type RouteName } from '@research-agent-platform/contracts'
import { readConfig } from '../src/config.js'
import { openDatabase,migrate,seed } from '../src/database.js'
import { passwordHash } from '../src/auth.js'
import { encrypt } from '../src/lab-ai-settings.js'
import { createServer } from '../src/server.js'
import { FeishuBitableClient } from '../src/integrations/feishu-bitable.js'
const cleanup:(()=>unknown|Promise<unknown>)[]=[]
// Reuse a generated fixture hash; actual HTTP logins still verify passwords.
// Repeated account provisioning is not part of these source-authorization tests.
const syntheticPassword=randomBytes(24).toString('hex'),syntheticHash=await passwordHash(syntheticPassword)
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn()})
const source='https://synthetic.feishu.cn/base/SyntheticBase123'
const json=(data:unknown)=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}})
const fields=[{field_id:'fldTitle',field_name:'题目',type:1},{field_id:'fldYear',field_name:'年份',type:2},{field_id:'fldGrade',field_name:'级别（CCF或者IF）',type:1},{field_id:'fldVenue',field_name:'发表期刊会议',type:1},{field_id:'fldAbstract',field_name:'摘要',type:1}]
const record=(id:string,year=2026,grade='CCF A',venue='Synthetic main conference')=>({record_id:id,fields:{题目:[{type:'text',text:'合成论文 '+id}],年份:year,'级别（CCF或者IF）':grade,发表期刊会议:venue,摘要:[{type:'text',text:'合成研究标记，非真实论文。'}]}})
async function setup(personal=false){
 const dir=mkdtempSync(join(tmpdir(),'acceptcat-bitable-'));cleanup.push(()=>rmSync(dir,{recursive:true,force:true}))
 const key=join(dir,'key'),secret=join(dir,'secret');writeFileSync(key,randomBytes(32).toString('hex'),{mode:0o600});writeFileSync(secret,'synthetic_secret_only',{mode:0o600})
 const config=readConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:4961',DATABASE_PATH:join(dir,'db'),BLOB_ROOT:join(dir,'blobs'),LAB_CREDENTIAL_KEY_FILE:key,FEISHU_APP_ID:'cli_synthetic',FEISHU_APP_SECRET_FILE:secret})
 mkdirSync(config.blobRoot);const db=openDatabase(config.databasePath,true);migrate(db);seed(db,'test');cleanup.push(()=>db.close())
 const accounts=['A','B','C'].map(l=>({memberId:'member_'+l,username:'library_'+l,password:syntheticPassword}));for(const a of accounts)db.prepare('INSERT INTO auth_accounts VALUES (?,?,?,0)').run(a.memberId,a.username,syntheticHash)
 db.prepare('INSERT INTO labs VALUES (?,?)').run('lab_other','Another synthetic lab');db.prepare('UPDATE members SET lab_id=? WHERE id=?').run('lab_other','member_C')
 if(personal){db.prepare('INSERT INTO labs VALUES (?,?)').run('lab_personal','Synthetic personal space');db.prepare('UPDATE members SET lab_id=? WHERE id=?').run('lab_personal','member_A');db.prepare('INSERT INTO personal_spaces VALUES (?,?)').run('lab_personal','member_A')}
 const remote={tables:[{table_id:'tblSynthetic1',name:'合成论文汇总'}],fields:[...fields],rows:[record('recSynthetic1'),record('recSynthetic2',2026,'CCF A(ACL Findings)'),record('recSynthetic3',2025),record('recSynthetic4',2026,'CCF A','Findings of Synthetic'),record('recSynthetic5')],denied:false,failSecond:false,repeatCursor:false,afterRead:undefined as undefined|(()=>void|Promise<void>),calls:[] as {url:string;method:string}[],tokens:[] as string[]}
 const app=createServer(config,{feishuTransport:async(input,init)=>{
  const url=new URL(String(input));remote.calls.push({url:url.pathname,method:init?.method??'GET'});remote.tokens.push(new Headers(init?.headers).get('authorization')??'');expect(url.origin).toBe('https://open.feishu.cn');expect(init?.redirect).toBe('error');
  if(remote.denied)return json({code:99991672,msg:'synthetic secret must never escape'})
  if(url.pathname.endsWith('/tables'))return json({code:0,data:{has_more:false,items:remote.tables}})
  if(url.pathname.endsWith('/fields'))return json({code:0,data:{has_more:false,items:remote.fields}})
  expect(url.pathname.endsWith('/records/search')).toBe(true);expect(init?.method).toBe('POST');const body=JSON.parse(String(init?.body));expect(body.field_names).toContain('题目');expect(body.field_names).not.toContain('附件');expect(body.automatic_fields).toBe(false)
  const next=url.searchParams.has('page_token');if(next&&remote.failSecond)return new Response('upstream unavailable',{status:503});await remote.afterRead?.();
  return json({code:0,data:{has_more:remote.repeatCursor||!next,page_token:remote.repeatCursor?'repeat':!next?'page2':undefined,items:next?remote.rows.slice(2):remote.rows.slice(0,2)}})
 }})
 await app.listen({host:'127.0.0.1',port:0});cleanup.push(()=>app.close())
 const clients:{cookie:string;csrf:string}[]=[]
 async function call(name:RouteName,body:unknown=null,who=0,params:Record<string,string>={},query:Record<string,string>={},key=randomUUID()){
  const route=routes[name],path=route.path.replace(/\{(\w+)\}/g,(_,k)=>params[k]!);const c=clients[who]
  const r=await app.inject({method:route.method,url:path+(Object.keys(query).length?'?'+new URLSearchParams(query):''),headers:{origin:config.origin,'content-type':'application/json','idempotency-key':key,...(c?{cookie:c.cookie,'x-csrf-token':c.csrf}:{})},...(route.method!=='GET'?{payload:JSON.stringify(body)}:{})});const value=JSON.parse(r.body);if(r.statusCode<300)route.response.parse(value);return {status:r.statusCode,value,headers:r.headers,text:r.body}
 }
 for(let i=0;i<accounts.length;i++){const a=accounts[i]!,r=await call('login',{username:a.username,password:a.password},i);clients[i]={cookie:String(r.headers['set-cookie']).split(';')[0]!,csrf:''};clients[i]!.csrf=(await call('session',null,i)).value.data.csrfToken;const lab=String(db.prepare('SELECT lab_id FROM members WHERE id=?').get(a.memberId)!.lab_id);db.prepare('INSERT INTO feishu_connections VALUES (?,?,?,?,?,?,?,?,?,?)').run(a.memberId,lab,'cli_synthetic','open_synthetic_'+i,'tenant_synthetic','合成用户',encrypt(config,`feishu:cli_synthetic:${lab}:${a.memberId}`,'synthetic_user_token_'+i),new Date(Date.now()+3600000).toISOString(),randomUUID(),new Date().toISOString())}
 const bind=(instruction='这是我的论文库',key=randomUUID(),url=source)=>call('bindFeishuLibrary',{url,instruction},0,{}, {},key)
 const query=(id:string,question='2026年CCF A论文',who=0,extra:Record<string,unknown>={})=>call('queryFeishuLibrary',{collectionId:id,question,...extra},who)
 const changeScope=(id:string,scope='lab_shared',who=0,key=randomUUID())=>{const c=db.prepare('SELECT * FROM research_collections WHERE id=?').get(id)!;return call('updateResearchCollection',{expectedVersion:Number(c.version),settings:{name:String(c.name),description:String(c.description),scope,taskIds:[]}},who,{id},{},key)}
 return {db,call,remote,bind,query,app,changeScope}
}
it('binds a private named collection, survives service re-entry, preserves old OAuth and opts into read-only scope',async()=>{
 const s=await setup(),legacy=await s.call('connectFeishu',{});expect(new URL(legacy.value.data.authorizationUrl).searchParams.get('scope')).not.toContain('bitable');const r=await s.bind();expect(r.status,r.text).toBe(200);const id=r.value.data.library.collectionId
 expect(r.value.data.library.name).toBe('论文库');expect((await s.call('feishuLibraries')).value.data[0].collectionId).toBe(id)
 const c=(await s.call('researchCollections',null,0,{}, {scope:'mine',limit:'100'})).value.data[0];expect(c).toMatchObject({id,scope:'owner_private',externalSource:'feishu_bitable',fileCount:0})
 const reconnect=await s.call('connectFeishu',{}),fresh=await s.call('connectFeishu',{libraryRead:true});expect(new URL(reconnect.value.data.authorizationUrl).searchParams.get('scope')).toContain('bitable:app:readonly');expect(new URL(fresh.value.data.authorizationUrl).searchParams.get('scope')).toContain('bitable:app:readonly')
 expect(String(s.db.prepare('SELECT encrypted_source FROM feishu_library_sources').get()!.encrypted_source)).not.toContain('SyntheticBase123')
})
it('retries binding idempotently, including concurrent lost acknowledgements, and does not duplicate collections',async()=>{
 const s=await setup(),key=randomUUID(),results=await Promise.all([s.bind('这是我的论文库',key),s.bind('这是我的论文库',key)]);expect(results.map(r=>r.status)).toEqual([200,200]);expect(s.db.prepare('SELECT count(*) n FROM research_collections').get()!.n).toBe(1)
 expect((await s.bind('这是我的论文库',key)).status).toBe(200);expect((await s.bind('这是另一个名字',key)).status).toBe(409)
})
it('requires selection for multiple tables and does not save an arbitrary table',async()=>{
 const s=await setup();s.remote.tables.push({table_id:'tblSynthetic2',name:'另一张合成表'});const r=await s.bind();expect(r.value.data.state).toBe('choose_table');expect(s.db.prepare('SELECT count(*) n FROM research_collections').get()!.n).toBe(0)
 const selected=await s.call('bindFeishuLibrary',{url:source,instruction:'这是我的论文库',tableId:'tblSynthetic2'});expect(selected.value.data.library.tableId).toBe('tblSynthetic2')
})
it('keeps new sources private and permits only the owner to explicitly share with their laboratory',async()=>{
 const s=await setup(),r=await s.bind(),id=r.value.data.library.collectionId;expect((await s.call('feishuLibraries',null,1)).value.data).toEqual([]);expect((await s.query(id,'2026年CCF A',1)).status).toBe(404)
 expect((await s.changeScope(id,'public')).status).toBe(403)
 expect((await s.changeScope(id,'lab_shared',1)).status).toBe(404)
 expect((await s.changeScope(id)).status).toBe(200)
 expect((await s.call('feishuLibraries',null,1)).value.data.map((x:{collectionId:string})=>x.collectionId)).toEqual([id])
 expect((await s.call('researchCollections',null,1,{}, {scope:'visible',limit:'100'})).value.data[0]).toMatchObject({id,owned:false,scope:'lab_shared'})
 expect((await s.call('feishuLibraries',null,2)).value.data).toEqual([])
 expect((await s.query(id,'2026年CCF A',2)).status).toBe(404)
})
it('queries only the explicitly shared table through the owner connection without exposing credentials or requiring member OAuth',async()=>{
 const s=await setup(),id=(await s.bind()).value.data.library.collectionId;await s.changeScope(id)
 s.db.prepare('DELETE FROM feishu_connections WHERE member_id=?').run('member_B');s.remote.tokens=[]
 const r=await s.query(id,'2026年CCF A',1);expect(r.status,r.text).toBe(200);expect(r.value.data.matched).toBe(2)
 expect(new Set(s.remote.tokens)).toEqual(new Set(['Bearer synthetic_user_token_0']))
 expect(r.text).not.toMatch(/synthetic_user_token|encrypted_source|encrypted_token|ownerId|appToken/)
 expect(r.value.data.limitations[0]).toContain('库主人明确共享')
 const bad=await s.query(id,'2026年CCF A',1,{url:'https://synthetic.feishu.cn/base/AnotherBase123'});expect(bad.status).toBe(400)
})
it('revoking sharing removes member discovery and blocks subsequent queries before any network read',async()=>{
 const s=await setup(),id=(await s.bind()).value.data.library.collectionId;await s.changeScope(id);await s.changeScope(id,'owner_private');const before=s.remote.calls.length
 expect((await s.call('feishuLibraries',null,1)).value.data).toEqual([]);expect((await s.query(id,'2026年CCF A',1)).status).toBe(404);expect(s.remote.calls).toHaveLength(before)
 expect((await s.query(id)).status).toBe(200)
})
it.each(['private','withdrawn','owner_disabled','member_moved'] as const)('rejects in-flight shared results after authority changes: %s',async change=>{
 const s=await setup(),id=(await s.bind()).value.data.library.collectionId;await s.changeScope(id)
 s.remote.afterRead=()=>{
  if(change==='private')s.db.prepare("UPDATE research_collections SET scope='owner_private',version=version+1 WHERE id=?").run(id)
  if(change==='withdrawn')s.db.prepare("UPDATE research_collections SET status='withdrawn',version=version+1 WHERE id=?").run(id)
  if(change==='owner_disabled')s.db.prepare('UPDATE auth_accounts SET disabled=1 WHERE member_id=?').run('member_A')
  if(change==='member_moved')s.db.prepare('UPDATE members SET lab_id=? WHERE id=?').run('lab_other','member_B')
 }
 const result=await s.query(id,'2026年CCF A',1);expect([403,404]).toContain(result.status);expect(result.text).not.toContain('合成论文')
})
it('directs shared connection failures to the owner while preserving private reauthorization behavior',async()=>{
 const s=await setup(),id=(await s.bind()).value.data.library.collectionId;await s.changeScope(id);s.db.prepare("UPDATE feishu_connections SET expires_at='2000-01-01T00:00:00Z' WHERE member_id=?").run('member_A')
 const shared=await s.query(id,'2026年CCF A',1);expect(shared.status).toBe(503);expect(shared.value.error.code).toBe('FEISHU_SHARED_SOURCE_UNAVAILABLE')
 expect((await s.query(id)).value.error.code).toBe('FEISHU_REAUTHORIZE')
})
it('preserves active explicit sharing when the owner rebinds, but restores withdrawn sources privately',async()=>{
 const s=await setup(),id=(await s.bind()).value.data.library.collectionId;await s.changeScope(id);await s.bind()
 expect((await s.query(id,'2026年CCF A',1)).status).toBe(200)
 const row=s.db.prepare('SELECT version FROM research_collections WHERE id=?').get(id)!
 await s.call('withdrawResearchCollection',{expectedVersion:Number(row.version)},0,{id});await s.bind()
 expect((await s.call('feishuLibraries',null,1)).value.data).toEqual([])
 expect(s.db.prepare('SELECT scope FROM research_collections WHERE id=?').get(id)!.scope).toBe('owner_private')
})
it('does not present a personal space as a laboratory sharing destination',async()=>{
 const s=await setup(true),id=(await s.bind()).value.data.library.collectionId;expect((await s.changeScope(id)).status).toBe(403)
})
it('reads all available pages, filters exact grade/year, cites records and reads live changes on the next question',async()=>{
 const s=await setup(),id=(await s.bind()).value.data.library.collectionId,r=await s.query(id);expect(r.status,r.text).toBe(200);expect(r.value.data).toMatchObject({complete:true,scanned:5,matched:2,state:'results'});expect(r.value.data.records.map((x:{id:string})=>x.id)).toEqual(['recSynthetic1','recSynthetic5']);expect(r.value.data.records[0].url).toContain('record=recSynthetic1')
 s.remote.rows.push(record('recSynthetic6'));expect((await s.query(id)).value.data.matched).toBe(3);expect(s.remote.calls.every(c=>c.method==='GET'||c.url.endsWith('/records/search'))).toBe(true)
})
it('asks for date clarification and does not scan records or invent a rolling-year answer',async()=>{
 const s=await setup(),id=(await s.bind()).value.data.library.collectionId,before=s.remote.calls.length,r=await s.query(id,'最近一年的ccfa论文');expect(r.value.data.state).toBe('clarification');expect(r.value.data.clarification).toContain('没有发表日期');expect(r.value.data.records).toEqual([]);expect(s.remote.calls.slice(before).some(c=>c.url.endsWith('/records/search'))).toBe(false)
})
it('refuses partial failed pages, repeated cursors and changed field identities rather than claiming empty success',async()=>{
 const s=await setup(),id=(await s.bind()).value.data.library.collectionId;s.remote.failSecond=true;expect((await s.query(id)).status).toBe(503);s.remote.failSecond=false;s.remote.repeatCursor=true;expect((await s.query(id)).status).toBe(503);s.remote.repeatCursor=false;s.remote.fields=s.remote.fields.filter(f=>f.field_id!=='fldYear');expect((await s.query(id)).value.error.code).toBe('FEISHU_LIBRARY_SCHEMA')
})
it('does not expose upstream messages or accept revoked source authority after the network returns',async()=>{
 const s=await setup(),id=(await s.bind()).value.data.library.collectionId;s.remote.denied=true;const denied=await s.query(id);expect(denied.status).toBe(403);expect(denied.text).not.toContain('synthetic secret');s.remote.denied=false
 s.remote.afterRead=()=>{s.db.prepare("UPDATE research_collections SET status='withdrawn',version=version+1 WHERE id=?").run(id)};expect((await s.query(id)).status).toBe(404)
})
it('paginates fields with the official 100-column limit and preserves field identities',async()=>{
 const calls:string[]=[]
 const client=new FeishuBitableClient(async(input)=>{const url=new URL(String(input));calls.push(url.href);expect(url.searchParams.get('page_size')).toBe('100');return json({code:0,data:{has_more:!url.searchParams.has('page_token'),page_token:'nextFields',items:url.searchParams.has('page_token')?fields:[...Array.from({length:100},(_,i)=>({field_id:'fldExtra'+i,field_name:'合成'+i,type:1}))]}})})
 const result=await client.fields('SyntheticBase123','tblSynthetic1','synthetic_user_token');expect(result).toHaveLength(105);expect(calls[1]).toContain('page_token=nextFields');expect(result.at(-1)?.id).toBe('fldAbstract')
})

it('shares an existing personal Feishu binding with newly joined accounts while retaining home encryption and IM identity',async()=>{
 const s=await setup(true),id=(await s.bind()).value.data.library.collectionId
 const original=s.db.prepare('SELECT * FROM feishu_connections WHERE member_id=?').get('member_A')
 const lab=(await s.call('createLab',{name:'Synthetic new group'})).value.data
 const invite=(await s.call('inviteLabMember',{username:'library_C'},0,{id:lab.id})).value.data
 expect((await s.call('decideLabInvitation',{expectedVersion:invite.version,decision:'accepted'},2,{id:invite.id})).status).toBe(200)
 expect((await s.query(id,'2026年CCF A',2)).status).toBe(404)
 expect((await s.changeScope(id)).status).toBe(200)
 s.db.prepare('DELETE FROM feishu_connections WHERE member_id=?').run('member_C');s.remote.tokens=[]
 const queried=await s.query(id,'2026年CCF A',2);expect(queried.status,queried.text).toBe(200)
 expect(new Set(s.remote.tokens)).toEqual(new Set(['Bearer synthetic_user_token_0']))
 expect(s.db.prepare('SELECT * FROM feishu_connections WHERE member_id=?').get('member_A')).toEqual(original)
 expect(s.db.prepare('SELECT lab_id FROM members WHERE id=?').get('member_A')!.lab_id).toBe('lab_personal')
 expect(s.db.prepare('SELECT lab_id FROM research_collection_labs WHERE collection_id=?').get(id)!.lab_id).toBe(lab.id)
})
it('fences a shared Feishu response when a newly joined member is removed during the external read',async()=>{
 const s=await setup(true),id=(await s.bind()).value.data.library.collectionId,lab=(await s.call('createLab',{name:'Synthetic revoke group'})).value.data
 const invite=(await s.call('inviteLabMember',{username:'library_C'},0,{id:lab.id})).value.data
 await s.call('decideLabInvitation',{expectedVersion:invite.version,decision:'accepted'},2,{id:invite.id});await s.changeScope(id)
 s.remote.afterRead=async()=>{s.remote.afterRead=undefined;const r=await s.call('removeLabMember',{expectedVersion:1},0,{id:lab.id,memberId:'member_C'});expect(r.status,r.text).toBe(200)}
 const queried=await s.query(id,'2026年CCF A',2);expect(queried.status,queried.text).toBe(403);expect(queried.value.error.code).toBe('FORBIDDEN');expect(queried.text).not.toContain('recSynthetic')
 expect((await s.call('feishuLibraries',null,2)).value.data).toEqual([])
 expect(s.db.prepare('SELECT lab_id FROM members WHERE id=?').get('member_C')!.lab_id).toBe('lab_other')
 expect((await s.call('session',null,2)).value.data.spaceKind).toBe('personal')
})
