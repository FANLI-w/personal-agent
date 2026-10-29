import { Alert, Button, Checkbox, Drawer, Input, Modal, Tag } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Link } from 'react-router-dom';
import type { RequestFor } from '@research-agent-platform/contracts';
import { workbenchTaskPath } from './workbench-links';
import { researchApi } from './api';
import { useResearchRead } from './useResearchRead';
import { useResearchStore } from './store';
import { usePersonalOperation } from './usePersonalOperation';
import { useGroupChatRoster, groupContactDescription } from './GroupChatRoster';
import { useChatTimeline } from './chat-timeline';

export const workStatus:Record<string,string>={awaiting_acceptance:'待负责人承接',ready:'已承接，等待开始',in_progress:'任务进行中',in_review:'成果已提交，待验收',completed:'已验收',cancelled:'已取消',claimed:'设备已领取',running:'本机正在执行',uncertain:'连接中断，结果待核对',finished:'本轮结束，待提交成果',failed:'本轮失败',stopped:'本轮已停止',unavailable:'群成员或来源权限已变化'};
export const useTeamWorkDraft=create<{source?:{conversationId:string;messageId:string;generation:number};choose:(source:{conversationId:string;messageId:string;generation:number})=>void}>((set)=>({choose:source=>set({source})}));

export function TeamWorkPanel({imID}:{imID?:string}){
  const mapping=useResearchStore(s=>s.mappings.find(m=>m.imConversationID===imID));
  const generation=useResearchStore(s=>s.generation);
  const id=mapping?.kind==='group'?mapping.researchConversationId:'';
  const source=useTeamWorkDraft(s=>s.source),roster=useGroupChatRoster();
  const [drawer,setDrawer]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [chosen,setChosen]=useState<Record<string,{title:string;goal:string}>>({});
  const request=useRef<{key:string;body:RequestFor<'createTeamWork'>['body']}>();
  const open=!!id&&source?.conversationId===id&&source.generation===generation;
  const operation=usePersonalOperation(!!id,`team-work:${id}`);
  const list=useResearchRead(signal=>researchApi('teamWork',{params:{id},signal}),`team-work:${id}`,!!id);
  const group=useResearchRead(signal=>researchApi('chatConversation',{params:{id},signal}),`team-work-source:${id}`,open);
  const agents=roster.data?.data.filter(c=>c.identity.kind==='personal_agent'&&!c.agentRuntime)||[];
  useEffect(()=>{setChosen({});setError('');setBusy(false);request.current=undefined;},[source?.messageId,id,generation]);
  useEffect(()=>{setDrawer(false);return()=>useTeamWorkDraft.setState({source:undefined});},[id,generation]);
  const close=()=>{if(!busy)useTeamWorkDraft.setState({source:undefined});};
  const submit=async()=>{
    if(busy||!source||!group.data)return;
    const {isCurrent}=operation.capture();setBusy(true);setError('');
    try{
      request.current??={key:crypto.randomUUID(),body:{sourceMessageId:source.messageId,expectedConversationVersion:group.data.data.version,assignments:Object.entries(chosen).map(([agentContactId,v])=>({agentContactId,...v}))}};
      await researchApi('createTeamWork',{params:{id},body:request.current.body,idempotencyKey:request.current.key});
      if(isCurrent()){useTeamWorkDraft.setState({source:undefined});setDrawer(true);await list.refresh();}
    }catch(e){if(isCurrent())setError(e instanceof Error?e.message:'分工未确认，请重试原操作。');}
    finally{if(isCurrent())setBusy(false);}
  };
  if(!id)return null;
  return <>
    <Button type="text" onClick={()=>setDrawer(true)}>协作任务{list.data?.data.length?` (${list.data.data.length})`:''}</Button>
    <Drawer title="群内协作任务" width={520} open={drawer} onClose={()=>setDrawer(false)}>
      <p>右键一条群消息，选择“安排文献任务”。负责人承接后在自己的设备上执行，成果由发起人验收。</p>
      {list.error&&<Alert type="error" message={list.error}/>}
      {list.data?.data.length===0&&<p>还没有从本群消息安排的任务。</p>}
      {list.data?.data.map(item=><article key={item.id} style={{padding:'16px 0',borderBottom:'1px solid #eee'}}>
        <strong>{item.title}</strong><p>{item.agentName} · {item.ownerName}的助手</p>
        <p><Tag>{workStatus[item.status]||item.status}</Tag><span>{item.deviceOnline?'负责人工作端在线':'负责人工作端离线或未打开'}</span></p>
        {item.execution&&<p>第 {item.execution.rounds} / {item.execution.maxRounds} 轮 · 每轮最多 3 分钟。运行结束后仍需核对、提交与验收。</p>}
        <div style={{display:'flex',gap:16}}>{item.canOpen&&<Link to={workbenchTaskPath(item.taskId,"research")}>打开任务</Link>}
        <Button size="small" onClick={()=>{useChatTimeline.setState({jump:{messageId:item.sourceMessageId}});setDrawer(false);}}>查看原消息</Button></div>
      </article>)}
    </Drawer>
    <Modal title="确认文献整理分工" open={open} onCancel={close} onOk={()=>void submit()} confirmLoading={busy} okText={request.current?'重试原分工':'确认分工'} okButtonProps={{disabled:!group.data||Object.keys(chosen).length===0||Object.values(chosen).some(v=>!v.title.trim()||!v.goal.trim())}}>
      <p>只选择已加入本群的助手，最多 5 位。选择同事的助手后，会先邀请同事承接任务；不会立即运行，也不会读取其私人记忆。</p>
      {(error||roster.error||group.error)&&<Alert type="error" message={error||roster.error||group.error}/>}
      {!agents.length&&<p>本群还没有可参与的个人助手，请先在群详情邀请助手及其负责人。</p>}
      {agents.map(agent=><div key={agent.id} style={{margin:'16px 0'}}>
        <Checkbox disabled={busy||!!request.current||(!chosen[agent.id]&&Object.keys(chosen).length>=5)} checked={!!chosen[agent.id]} onChange={e=>setChosen(old=>{const next={...old};if(e.target.checked)next[agent.id]={title:'文献整理',goal:''};else delete next[agent.id];return next;})}>{agent.displayName} · {groupContactDescription(agent,roster.data?.data||[],operation.actorId)}</Checkbox>
        {chosen[agent.id]&&<div style={{display:'grid',gap:8,marginTop:8}}>
          <Input aria-label={`${agent.displayName}的任务名称`} maxLength={120} disabled={busy||!!request.current} value={chosen[agent.id].title} onChange={e=>setChosen(old=>({...old,[agent.id]:{...old[agent.id],title:e.target.value}}))}/>
          <Input.TextArea aria-label={`${agent.displayName}的整理要求`} placeholder="要整理什么、使用哪些已授权资料、交付什么成果" maxLength={4000} disabled={busy||!!request.current} value={chosen[agent.id].goal} onChange={e=>setChosen(old=>({...old,[agent.id]:{...old[agent.id],goal:e.target.value}}))}/>
        </div>}
      </div>)}
      <p>群内共享分工与状态。工具过程、私人文件路径及私人记忆留在本机；成果提交前由负责人核对。</p>
    </Modal>
  </>;
}
