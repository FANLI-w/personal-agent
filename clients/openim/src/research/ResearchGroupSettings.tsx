import {Alert,Button,Modal,Select,Spin,Tag} from 'antd';
import {useState} from 'react';
import type {Contact,Conversation} from '@research-agent-platform/contracts';
import {researchApi} from './api';
import {useResearchRead} from './useResearchRead';
import {useResearchStore} from './store';
import {useWorkspaceAvailability} from './useWorkspaceAvailability';
import {usePersonalOperation} from './usePersonalOperation';
import {useConversationStore} from '@/store';
import {groupNoticeStatus} from './GroupNoticeCard';

export function ResearchGroupSettings({group,contacts,onRefresh}:{group:Conversation;contacts:Contact[];onRefresh?:()=>Promise<void>}){
  const availability=useWorkspaceAvailability(true),supported=availability.supports(46);
  const actor=useResearchStore(s=>s.actor?.member.id),owner=group.ownerMemberId===actor;
  const [expanded,setExpanded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [lab,setLab]=useState<string>(),[successor,setSuccessor]=useState<string>();
  const scope=usePersonalOperation(true,`group-settings:${group.id}`);
  const read=useResearchRead(async signal=>{
    const [settings,labs,notices]=await Promise.all([
      researchApi('groupSettings',{params:{id:group.id},signal}),
      owner?researchApi('groupLabChoices',{signal}):null,
      researchApi('groupNotices',{params:{id:group.id},signal}),
    ]);return {settings:settings.data,labs:labs?.data,notices:notices.data};
  },`group-settings:${group.id}:${group.version}:${owner}`,expanded&&supported);
  const members=contacts.filter(c=>c.identity.kind==='human'&&c.identity.memberId!==actor&&group.members.some(m=>m.contactId===c.id&&m.status==='joined'));
  async function mutate(action:()=>Promise<unknown>,left=false){
    const operation=scope.capture();if(!operation.isCurrent()||busy)return;
    setBusy(true);setError('');
    try{await action();if(!operation.isCurrent())return;
      if(left)useConversationStore.getState().updateCurrentConversation();
      await useResearchStore.getState().refresh();
      if(operation.isCurrent()){await onRefresh?.();await read.refresh();}
    }catch(cause){if(operation.isCurrent())setError(cause instanceof Error?cause.message:'操作未完成，请重试');}
    finally{if(operation.isCurrent())setBusy(false);}
  }
  const version=read.data?.settings.conversation.version??group.version;
  const hasGroupAssistant=contacts.some(c=>c.groupConversationId===group.id&&group.members.some(m=>m.contactId===c.id&&m.status==='joined'));
  return <div className="mb-4 rounded-lg border border-[var(--gap-text)] p-3 text-sm">
    <div className="flex items-center justify-between"><span>{hasGroupAssistant?'群助理 · 本群专用':'群设置'}</span><Button type="link" onClick={()=>setExpanded(v=>!v)}>{expanded?'收起':'规则与群设置'}</Button></div>
    <p className="text-xs text-[var(--sub-text)]">{hasGroupAssistant?'只在被 @ 时回答，不读取个人规则、偏好和私聊。':'固定群助理与转达需要后台 0.46；升级前沿用已有聊天与成员。'}</p>
    {expanded&&<div className="mt-3 space-y-3">
      {!supported?<p>群助理与群设置需要后台 0.46，当前服务尚未支持。</p>:<>
      {read.loading&&!read.data?<Spin size="small"/>:null}
      {read.error?<Alert type="error" message={read.error} action={<Button onClick={()=>void read.refresh()}>重试</Button>}/>:null}
      {read.data&&<>
        <p>{read.data.settings.labName?`本群适用：平台规则 + ${read.data.settings.labName}课题组规则`:'本群未关联课题组，只适用平台规则。'}</p>
        {owner&&<div className="space-y-2">
          <Select aria-label="更换本群课题组" className="w-full" disabled={busy} value={lab??group.labId??''} onChange={setLab} options={[{value:'',label:'不关联课题组'},...(read.data.labs?.labs??[]).map(l=>({value:l.id,label:l.name}))]}/>
          <Button disabled={busy||lab===undefined||lab===(group.labId??'')} onClick={()=>Modal.confirm({title:'更换本群课题组？',content:'从下一次请求起使用新规则，历史消息和任务权限不变。',onOk:()=>mutate(()=>researchApi('updateGroupLab',{params:{id:group.id},body:{expectedVersion:version,labId:lab||null}}))})}>保存群归属</Button>
        </div>}
        {(owner||read.data.settings.canTakeOver)&&<div className="space-y-2">
          <Select aria-label="新群主" placeholder="选择已加入的真人成员" className="w-full" disabled={busy} value={successor} onChange={setSuccessor} options={members.map(c=>({value:c.identity.kind==='human'?c.identity.memberId:'',label:c.displayName}))}/>
          <Button disabled={!successor||busy} onClick={()=>Modal.confirm({title:'转移群管理权？',content:'群归属不变，不转移任何任务或资料权限。',onOk:()=>mutate(()=>researchApi('transferGroupOwner',{params:{id:group.id},body:{expectedVersion:version,memberId:successor!}}))})}>转移群主</Button>
        </div>}
        <Button danger disabled={busy||(owner&&!successor)} onClick={()=>Modal.confirm({title:'退出群聊？',content:owner?'同时将群主转交给选中的真人成员。':'退出后不能继续读取本群。',onOk:()=>mutate(()=>researchApi('leaveChatGroup',{params:{id:group.id},body:{expectedVersion:version,...(owner?{successorMemberId:successor}:{})}}),true)})}>退出群聊</Button>
        {owner&&!successor?<p className="text-xs text-[var(--sub-text)]">退群前须先选择一位新群主。</p>:null}
        <h4 className="font-medium">转达记录</h4>
        {!read.data.notices.length?<p className="text-[var(--sub-text)]">可 @群助理 转告或询问本群成员。任务指派尚未开放。</p>:read.data.notices.map(n=><article key={n.id} className="rounded border border-[var(--gap-text)] p-3">
          <p>{n.fromName} → {n.toName} <Tag>{n.kind==='ask'?'询问':'告知'}</Tag></p>
          <p className="my-2 whitespace-pre-wrap break-words">{n.text}</p>
          <p className="text-xs text-[var(--sub-text)]">{groupNoticeStatus[n.status]} · {new Date(n.respondedAt??n.deliveredAt??n.createdAt).toLocaleString()}</p>
          {n.canWithdraw?<Button type="link" danger disabled={busy} onClick={()=>void mutate(()=>researchApi('withdrawGroupNotice',{params:{id:group.id,noticeId:n.id},body:{}}))}>撤回转达</Button>:null}
        </article>)}
      </>}
      </>}
      {error?<Alert type="error" message={error}/>:null}
    </div>}
  </div>;
}
