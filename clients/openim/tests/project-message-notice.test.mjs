import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

async function load(file,imports={}){
 const source=await readFile(new URL(file,import.meta.url),'utf8'),module={exports:{}};
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,Map,Promise,JSON,require:name=>{
  if(name in imports)return imports[name];throw Error('Unexpected import '+name);
 }});
 return module.exports;
}
const {createProjectNoticeReader,isProjectNoticeCandidate}=await load('../src/research/project-message-notice.ts');
const fact={id:'decision',conversationId:'personal',sequence:5,senderContactId:'coordinator',origin:'service',text:'本轮实验数量具体是多少？',turnId:null,resources:[],actionIds:[],mentions:[]};
const reply={messageId:'owner-request',sequence:1,senderContactId:'owner',text:'持续跟进这次研究',withdrawn:false};
const notice={projectId:'project',taskId:'work',kind:'decision'};
const nodes=tree=>Array.isArray(tree)?tree.flatMap(nodes):!tree||typeof tree!=='object'?[]:[tree,...nodes(tree.props?.children)];

test('only coordinator service replies with a real source quote request project metadata',()=>{
 assert.equal(isProjectNoticeCandidate(fact,reply,true),true);
 for(const value of [{...fact,origin:'human'},{...fact,origin:'model'},{...fact,turnId:'actual-turn'},{...fact,resources:[{kind:'task'}]},{...fact,senderContactId:null}])assert.equal(isProjectNoticeCandidate(value,reply,true),false);
 assert.equal(isProjectNoticeCandidate(fact,reply,false),false);
 assert.equal(isProjectNoticeCandidate(fact,null,true),false);
 assert.equal(isProjectNoticeCandidate(fact,{...reply,withdrawn:true},true),false);
});

test('history and workspace rerenders share a single request and cache negative results',async()=>{
 let count=0;
 const read=createProjectNoticeReader(async(_conversation,id)=>{count++;return id==='decision'?notice:null;});
 const values=await Promise.all(Array.from({length:8},()=>read(1,'personal','decision')));
 assert.equal(count,1);assert.ok(values.every(value=>value===notice));
 await read(1,'personal','ordinary');await read(1,'personal','ordinary');assert.equal(count,2);
 await read(1,'personal','decision');assert.equal(count,2);
 await read(2,'personal','decision');assert.equal(count,3);
});

test('a whole page of eligible legacy history performs only one capability404',async()=>{
 let count=0;
 const read=createProjectNoticeReader(async()=>{count++;throw Object.assign(Error('old server'),{status:404});});
 const values=await Promise.all(Array.from({length:20},(_,i)=>read(1,'personal','message-'+i)));
 assert.ok(values.every(value=>value===null));assert.equal(count,1);
 await read(1,'personal','more-history');assert.equal(count,1);
 await read(2,'personal','different-account');assert.equal(count,2);
});

async function renderMessage(projectNotice){
 const jsx=(type,props)=>({type,props}),queries=[];
 const store={generation:1,contacts:[{contact:{id:'coordinator',profile:{role:'coordinator'}}}],mappings:[{imConversationID:'im',kind:'personal'}]};
 const imports={
  react:{useContext:()=>({messageIds:new Set()}),useEffect(){},useState:()=>[undefined,()=>{}]},
  'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},
  antd:{Alert:'Alert',Button:'Button'},
  '@research-agent-platform/contracts':{OpenImResearchPointer:{safeParse:()=>({success:true,data:{conversationId:'personal',messageId:'decision',sequence:5}})}},
  './api':{researchApi:async()=>({data:projectNotice}),supportsTranscriptSync:()=>true},
  './useResearchRead':{useResearchRead(_read,identity,enabled,options){
   queries.push({identity,enabled,options});
   return {data:identity.startsWith('project-message:')?projectNotice:identity==='im:personal:decision:5'?{fact,details:{replyTo:reply}}:undefined,refresh(){},invalidate(){}};
  }},
  './store':{useResearchStore:selector=>selector(store)},
  '@/store':{useConversationStore:selector=>selector({currentConversation:{conversationID:'im'}})},
  './agent-progress':{AgentProgressHistory:'History'},
  './task-notice':{isTaskNotice:()=>false,legacyTaskInvitation:()=>undefined,serviceNoticePreview:text=>text,splitTaskResources:()=>({tasks:[],others:[]})},
  './project-message-notice':{createProjectNoticeReader,isProjectNoticeCandidate},
  './chat-message-read':{},'./useChatRecordChanges':{useChatRecordChanges(){}},'./chat-transcript-sync':{},'./chat-timeline':{},
  '@/pages/chat/queryChat/MessageItem/message-item.module.scss':{__esModule:true,default:{bubble:'bubble'}},
  './PersonalReceiptCard':{PersonalReceiptCard:'PersonalReceiptCard',WorkTaskReceipt:'WorkTaskReceipt'},
  './SafeMessageMarkdown':{__esModule:true,default:'SafeMessageMarkdown'},
 };
 for(const name of ['./GroupNoticeCard','./ResearchActionCard','./ResearchTaskCard','./ResearchTurnStatus','./CreatedAgentChatButton','./AgentFileReadSummary','./ContinueAgentFileReadingButton','./ResearchReadSummary','./GroupMessageStatuses'])imports[name]={};
 const component=(await load('../src/research/ResearchMessageRender.tsx',imports)).default;
 return {tree:component({message:{clientMsgID:'sdk-decision',customElem:{data:'{}'}}}),queries};
}

test('real message renderer expands host project questions/results with the corresponding task link',async()=>{
 for(const kind of ['decision','result']){
  const {tree,queries}=await renderMessage({...notice,kind}),all=nodes(tree);
  assert.equal(all.some(node=>node.type==='details'&&node.props.className==='chat-system-notice'),false);
  assert.ok(all.some(node=>node.type==='SafeMessageMarkdown'&&node.props.text===fact.text));
  assert.equal(all.find(node=>node.type==='WorkTaskReceipt').props.taskId,'work');
  assert.equal(all.find(node=>node.type==='WorkTaskReceipt').props.poll,false);
  assert.equal(queries.find(query=>query.identity.startsWith('project-message:')).options.poll,false);
 }
});

test('an ordinary system notice keeps its existing folded presentation',async()=>{
 const {tree}=await renderMessage(null),all=nodes(tree);
 assert.equal(all.some(node=>node.type==='details'&&node.props.className==='chat-system-notice'),true);
 assert.equal(all.some(node=>node.type==='WorkTaskReceipt'),false);
});

test('actual task receipt opens its exact personal task without pretending model completion',async()=>{
 const navigations=[],jsx=(type,props)=>({type,props});
 const imports={react:{},'react/jsx-runtime':{jsx,jsxs:jsx},antd:{Button:'Button'},'react-router-dom':{useNavigate:()=>path=>navigations.push(path)},
  './api':{},'./useResearchRead':{useResearchRead:()=>({data:{data:{title:'Research project',status:'blocked',summaryOnly:false}}})},
  './usePersonalOperation':{},'./PersonalAssistantPanel':{},'./personal-time':{},'./CreatedAgentChatButton':{},'./AssistantWorkTaskButton':{},
  './workbench-links':{workbenchTaskPath:id=>'/workbench/personal/'+id},'./NativeWorkbenchTaskButton':{NativeWorkbenchTaskButton:'NativeWorkbenchTaskButton'}};
 const {WorkTaskReceipt}=await load('../src/research/PersonalReceiptCard.tsx',imports),all=nodes(WorkTaskReceipt({taskId:'exact-work'}));
 all.find(node=>node.type==='Button').props.onClick();
 assert.deepEqual(navigations,['/workbench/personal/exact-work']);
 assert.ok(all.some(node=>node.type==='p'&&node.props.children==='需要处理的问题'));
});
