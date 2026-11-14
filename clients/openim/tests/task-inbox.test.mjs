import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source=await readFile(new URL('../src/research/task-inbox.ts',import.meta.url),'utf8');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,Set,Error,Promise});
const {collectTaskInbox,workbenchNextAction}=mod.exports;
const signal=()=>new AbortController().signal;
const card=(id,source='research_task')=>({id,taskId:id,source,title:'同名任务',allowedActions:['claim']});
const page=(data,nextCursor=null)=>({data,nextCursor});
const mine=(...ids)=>async()=>({data:ids.map(id=>({task:{id}})),truncated:false});

test('mine is defined by authorized scope IDs, not matching names, claim rights or visibility',async()=>{
 const input=[card('created'),card('participant'),card('reviewer'),card('invited'),card('claimable'),card('unrelated'),card('personal','personal_task'),card('schedule','followup')];
 const result=await collectTaskInbox(async()=>page(input),mine('created','participant','reviewer','invited'),signal());
 assert.deepEqual(Array.from(result.data,c=>c.id),['created','participant','reviewer','invited','personal','schedule']);
 assert.equal(input.length,8);assert.equal(result.truncated,false);
});
test('filters after collecting pages so unrelated first-page rows cannot hide later personal tasks',async()=>{
 const calls=[];
 const result=await collectTaskInbox(async(cursor,s)=>{calls.push(cursor);assert.equal(s.aborted,false);return cursor?page([card('personal','personal_task')]):page([card('not-mine')],'next');},mine(),signal());
 assert.deepEqual(calls,[undefined,'next']);assert.deepEqual(Array.from(result.data,c=>c.id),['personal']);
});
test('a failed mine read never falls back to displaying the entire team as personal work',async()=>{
 await assert.rejects(collectTaskInbox(async()=>page([card('other')]),async()=>{throw Error('401')},signal()),/401/);
});
test('failed later pages are errors, not an empty or complete personal inbox',async()=>{
 await assert.rejects(collectTaskInbox(async cursor=>{if(cursor)throw Error('offline');return page([card('one')],'next')},mine('one'),signal()),/offline/);
});
test('repeated cursors and task IDs are rejected rather than double-counted',async()=>{
 let n=0;
 await assert.rejects(collectTaskInbox(async()=>page([card(String(++n))],'same'),mine(),signal()),/分页重复/);
 await assert.rejects(collectTaskInbox(async()=>page([card('same')],'next'),mine(),signal()),/发生变化/);
});
test('both bounded card reads and partial mine coverage are explicitly marked partial',async()=>{
 let n=0;
 const bounded=await collectTaskInbox(async()=>page([card(String(++n),'personal_task')],String(n)),mine(),signal());
 assert.equal(n,10);assert.equal(bounded.data.length,10);assert.equal(bounded.truncated,true);
 const partial=await collectTaskInbox(async()=>page([card('mine'),card('unknown')]),async()=>({data:[{task:{id:'mine'}}],truncated:true}),signal());
 assert.equal(partial.truncated,true);assert.deepEqual(Array.from(partial.data,c=>c.id),['mine']);
});
test('cancellation prevents late reads from establishing an inbox for another account',async()=>{
 const c=new AbortController();
 await assert.rejects(collectTaskInbox(async()=>{c.abort();return page([card('private')])},mine('private'),c.signal),{name:'AbortError'});
});
test('personal spaces and old services do not require the laboratory-only scope API',async()=>{
 const result=await collectTaskInbox(async()=>page([card('personal','personal_task')]),undefined,signal());
 assert.equal(result.data[0].id,'personal');assert.equal(result.truncated,false);
});

test('next action uses current grants so observers wait while reviewers and contributors can act',()=>{
 const task={source:'research_task',summaryOnly:false,status:'in_review',allowedActions:[],progress:{label:'in_review'}};
 assert.equal(workbenchNextAction(task),'等待验收意见');
 assert.equal(workbenchNextAction({...task,allowedActions:['review']}),'查看成果并验收');
 assert.equal(workbenchNextAction({...task,status:'in_progress'}),'查看进展，等待成员交付');
 assert.equal(workbenchNextAction({...task,status:'in_progress',allowedActions:['submit']}),'提交文件或阶段成果');
 assert.equal(workbenchNextAction({...task,status:'changes_requested'}),'等待承接人修改');
 assert.equal(workbenchNextAction({...task,status:'changes_requested',allowedActions:['submit']}),'修改后重新提交');
 assert.equal(workbenchNextAction({...task,status:'awaiting_acceptance',summaryOnly:true,allowedActions:['decide']}),'确认是否承接');
 assert.equal(workbenchNextAction({...task,status:'completed',allowedActions:['review']}),'查看已验收成果');
});
