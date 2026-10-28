import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve('vite/package.json'))('esbuild');
const dir = await mkdtemp(path.join(tmpdir(), 'group-mentions-'));
const output = path.join(dir, 'mentions.cjs');
await esbuild.build({entryPoints:[fileURLToPath(new URL('../src/research/group-mentions.ts', import.meta.url))],outfile:output,bundle:true,format:'cjs',platform:'node'});
const { groupMentions, groupMessageBody, selectedGroupMentions, addressGroupReply } = require(output);
const statusOutput=path.join(dir,'status.cjs');
await esbuild.build({entryPoints:[fileURLToPath(new URL('../src/research/group-agent-status.ts',import.meta.url))],outfile:statusOutput,bundle:true,format:'cjs',platform:'node'});
const {groupAgentStatusText}=require(statusOutput);
const agent = {id:'agent',displayName:'文献助手',agent:true,external:false};
const human = {id:'human',displayName:'小林',agent:false,external:false};
test('explicit leading Agent address has exact UTF-16 ranges',()=>{
  assert.deepEqual(groupMentions('  @文献助手 整理摘要',[agent,human]),{mentions:[{contactId:'agent',start:2,end:7}],agentContactIds:['agent']});
  const emoji={...human,displayName:'小林😀'};
  assert.equal(groupMentions('@小林😀 你好',[emoji]).mentions[0].end,5);
});
test('ordinary or quoted @ content does not dispatch',()=>{
  for(const text of ['转述：@文献助手 整理摘要','“@文献助手 整理摘要”','请看邮箱 a@b.com'])assert.equal(groupMentions(text,[agent,human]),undefined);
});
test('human mention stays chat; one human and Agent are both addressed',()=>{
  assert.deepEqual(groupMentions('@小林 你好',[agent,human]).agentContactIds,[]);
  const result=groupMentions('@小林 @文献助手 对照结果',[agent,human]);
  assert.deepEqual(result.agentContactIds,['agent']);assert.equal(result.mentions.length,2);
});
test('unknown, unjoined, duplicate and ambiguous names are rejected',()=>{
  assert.throws(()=>groupMentions('@未入群 去做',[agent,human]));
  assert.throws(()=>groupMentions('@文献助手 去做',[]));
  assert.throws(()=>groupMentions('@小林 @小林 你好',[human]));
  assert.throws(()=>groupMentions('@小林 你好',[human,{...human,id:'other'}]));
});
test('several local group Agents share one input, while external consent stays separate',()=>{
  assert.throws(()=>groupMentions('@文献助手 去做',[{...agent,external:true}]));
  const joined=[agent,{...agent,id:'second',displayName:'统计助手'}];
  const body=groupMessageBody('@文献助手 @统计助手 去做',joined);
  assert.deepEqual(body.agentContactIds,['agent','second']);
  assert.deepEqual(body.budget,{maxTokens:32000,maxSeconds:180});
  assert.equal(body.agentContactId,undefined);
  assert.deepEqual(body.mentions,[{contactId:'agent',start:0,end:5},{contactId:'second',start:6,end:11}]);
});
test('new ordinary group requests get context room without changing explicit advanced or old queued budgets',()=>{
  assert.deepEqual(groupMessageBody('@文献助手 你好',[agent]).budget,{maxTokens:16000,maxSeconds:90});
  assert.equal(groupMessageBody('@文献助手 你好',[agent]).agentContactId,'agent');
  assert.equal(groupMessageBody('@小林 你好',[human]).budget,null);
  assert.equal(groupMessageBody('@小林 你好',[human]).intent,'chat');
  assert.equal(groupMessageBody('转述 @文献助手 你好',[agent]),undefined);
});
test('batch caps at five distinct local Agents and rejects partial dispatch',()=>{
  const joined=Array.from({length:6},(_,i)=>({...agent,id:`agent${i}`,displayName:`助手${i}`}));
  const prefix=n=>joined.slice(0,n).map(c=>`@${c.displayName}`).join(' ')+' 你好';
  assert.deepEqual(groupMessageBody(prefix(5),joined).budget,{maxTokens:80000,maxSeconds:450});
  assert.throws(()=>groupMessageBody(prefix(6),joined),/最多同时 @5/);
});
test('address boundary and nonempty message are required',()=>{
  assert.throws(()=>groupMentions('@小林同学 你好',[human]));
  assert.throws(()=>groupMentions('@小林   ',[human]));
  assert.equal(groupMentions('@小林 你好 @文献助手 这句只转述',[agent,human]).mentions.length,1);
});
test('shared group status distinguishes actual replies, waiting, interruption and budget failures',()=>{
  assert.equal(groupAgentStatusText({status:'queued',failure:null}),'等待回复');
  assert.equal(groupAgentStatusText({status:'running',failure:null}),'正在回复');
  assert.equal(groupAgentStatusText({status:'succeeded',failure:null}),'已回复');
  assert.equal(groupAgentStatusText({status:'waiting_input',failure:null}),'等待补充信息');
  assert.match(groupAgentStatusText({status:'failed',failure:'BUDGET_EXCEEDED'}),/超出预算/);
  assert.match(groupAgentStatusText({status:'cancelled',failure:'AUTHORITY_CHANGED'}),/权限发生变化/);
});

test('selected mentions anywhere in prose keep exact identities for same-name Agents', () => {
  const other = { ...agent, id: 'colleague-agent' };
  const text = '请😀 @文献助手 比较方法，再请 @文献助手 检查局限';
  const first = text.indexOf('@'), second = text.lastIndexOf('@');
  const selected = [{contactId:agent.id,start:first,end:first+5},{contactId:other.id,start:second,end:second+5}];
  const body = groupMessageBody(text, [agent, other], selected);
  assert.deepEqual(body.agentContactIds, [agent.id, other.id]);
  assert.deepEqual(body.mentions, selected);
  assert.deepEqual(body.budget, {maxTokens:32000,maxSeconds:180});
});

test('selected identity is revalidated after removal, rename or unavailability', () => {
  const text = '请 @文献助手 整理';
  const mentions = [{contactId:agent.id,start:2,end:7}];
  for (const roster of [[], [{...agent,displayName:'新名称'}], [{...agent,external:true}], [{...agent,unavailable:true}]])
    assert.throws(() => groupMessageBody(text, roster, mentions));
  assert.throws(() => selectedGroupMentions(text,[agent],[{...mentions[0],start:-1}]));
  assert.throws(() => selectedGroupMentions(text,[agent],[{...mentions[0],end:8}]));
  assert.throws(() => selectedGroupMentions(text,[agent],[{...mentions[0],end:7.5}]));
  assert.throws(() => groupMessageBody('@文献助手 整理',[{...agent,unavailable:true}]));
});

test('selecting the same Agent twice dispatches once and does not call a quoted Agent', () => {
  const text = '@文献助手 请对照 @文献助手 的结果\n> @小林 不要执行引文';
  const second = text.indexOf('@', 1);
  const result = groupMessageBody(text,[agent,human],[{contactId:agent.id,start:0,end:5},{contactId:agent.id,start:second,end:second+5}]);
  assert.equal(result.agentContactId,agent.id);
  assert.equal(result.mentions.length,1);
  assert.deepEqual(result.budget,{maxTokens:16000,maxSeconds:90});
});

test('follow-up routes to the quoted Agent by ID; explicit recipients take precedence', () => {
  const other = {...agent,id:'other',displayName:'方法助手'};
  const result = addressGroupReply('为什么？',[],[agent,other],other.id);
  const body = groupMessageBody(result.text,[agent,other],result.mentions);
  assert.equal(body.agentContactId,other.id);
  assert.equal(body.text,'@方法助手 为什么？');
  assert.deepEqual(addressGroupReply('仅引用',[],[agent]),{text:'仅引用',mentions:[]});
  assert.equal(addressGroupReply('@文献助手 请说明',[],[agent,other],other.id).text,'@文献助手 请说明');
  assert.throws(() => addressGroupReply('为什么？',[],[agent],other.id),/已不在当前群/);
});

test('selected mention limits apply to the complete request without partial dispatch', () => {
  const roster=Array.from({length:6},(_,i)=>({...agent,id:`agent_${i}`,displayName:`助手${i}`}));
  let text='请检查：';
  const selected=roster.map(c=>{const start=text.length;text+=`@${c.displayName} `;return {contactId:c.id,start,end:text.length-1};});
  assert.throws(()=>groupMessageBody(text,roster,selected),/最多同时 @5/);
  assert.throws(()=>groupMessageBody('@文献助手',[agent],[{contactId:agent.id,start:0,end:5}]),/写上/);
});
