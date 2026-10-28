import { Alert } from 'antd';
import { researchApi } from './api';
import { useResearchRead } from './useResearchRead';
import { workStatus } from './TeamWorkPanel';
import type { TaskTarget } from '../../../../integrations/deepseek-harness/desktop/task-workspace';

export function TaskExecutionStatus({target}: {target:TaskTarget}){
  const read=useResearchRead(signal=>researchApi('workExecution',{params:{kind:target.kind,id:target.taskId},signal}),`execution:${target.kind}:${target.taskId}`);
  const e=read.data?.data.execution,team=read.data?.data.team;
  if(read.error)return <Alert type="warning" message="暂时无法核对共享执行状态" description={read.error}/>;
  if(!team&&!e)return null;
  return <Alert type={e?.phase==='uncertain'?'warning':'info'} message={team?`${team.agentName} · ${team.ownerName}的助手 · ${workStatus[team.status]||team.status}`:workStatus[e?.phase||'ready']} description={<>
    {e?<p>已使用 {e.rounds} / {e.maxRounds} 轮；本轮截止 {new Date(e.deadlineAt).toLocaleTimeString()}。同一任务由一台设备执行。</p>:<p>负责人承接并开始任务后，在本机工作区发出要求。</p>}
    {e?.phase==='uncertain'&&<p>请在原设备打开本任务核对；不会自动重跑。若请求回执丢失，可重试原请求，不能由另一设备接管。</p>}
    <p>每轮 3 分钟；检测到 12 次模型尝试时请求停止，通知不会自动触发助手。执行结束后，请核对成果并提交，由发起人验收。</p>
  </>}/>;
}
