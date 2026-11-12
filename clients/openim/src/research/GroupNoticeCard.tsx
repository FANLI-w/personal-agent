import {Alert,Button,Tag} from 'antd';
import {useState} from 'react';
import {researchApi} from './api';
import {useResearchRead} from './useResearchRead';
import {usePersonalOperation} from './usePersonalOperation';

export const groupNoticeStatus={pending:'已排队，尚未送达',delivered:'已进入对方会话 · 不代表已读',responded:'已回应',withdrawn:'已撤回',cancelled:'未送达'};
export function GroupNoticeCard({id}:{id:string}){
  const read=useResearchRead(signal=>researchApi('groupNotice',{params:{id},signal}),`group-notice:${id}`,true,{poll:value=>!!value&&['pending','delivered'].includes(value.data.status)});
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const operation=usePersonalOperation(true,`notice:${id}`),n=read.data?.data;
  return <article className="min-w-[240px] max-w-[480px] rounded-lg border border-[var(--gap-text)] bg-white p-3 text-sm" aria-label="群助理转达">
    {!n?<p>{read.error||'正在核对转达记录…'} <Button size="small" onClick={()=>void read.refresh()}>重新核对</Button></p>:<>
      <p className="font-medium">{n.fromName} → {n.toName} <Tag>{n.kind==='ask'?'询问':'告知'}</Tag></p>
      <p className="my-2 whitespace-pre-wrap break-words">{n.text}</p>
      <p className="text-xs text-[var(--sub-text)]">{groupNoticeStatus[n.status]} · {new Date(n.respondedAt??n.deliveredAt??n.createdAt).toLocaleString()}</p>
      {n.status==='delivered'?<p className="mt-2 text-xs text-[var(--sub-text)]">收件人可引用这条通知回复；群内只显示“已回应”。</p>:null}
      {n.canWithdraw?<Button type="link" danger disabled={busy} onClick={async()=>{
        const captured=operation.capture();if(busy||!captured.isCurrent())return;setBusy(true);setError('');
        try{await researchApi('withdrawGroupNotice',{params:{id:n.conversationId,noticeId:n.id},body:{}});if(captured.isCurrent())await read.refresh();}
        catch(e){if(captured.isCurrent())setError(e instanceof Error?e.message:'撤回未完成，请重试');}
        finally{if(captured.isCurrent())setBusy(false);}
      }}>撤回转达</Button>:null}
    </>}
    {error?<Alert type="error" message={error}/>:null}
  </article>;
}
