import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { DshTaskWorkspace, taskKey, type TaskTarget, type TaskContext } from './task-workspace';
import type { WorkInputs } from './work-memory';
import type { WorkExecution } from '../../../packages/contracts/src/team-work';

import { localDeviceId } from './device-identity';
type Receipt={target:TaskTarget;execution:WorkExecution;sessionId:string;baseline:number};
type Business=(url:string,body?:unknown,key?:string)=>Promise<any>;
const active=(e:WorkExecution|null)=>!!e&&['claimed','running','uncertain'].includes(e.phase);

/** Journals survive renderer navigation/restart. A lost heartbeat never grants another device the lock. */
export class TeamExecution {
  private busy=false;
  private timer?:ReturnType<typeof setInterval>;
  private receipts=new Map<string,Receipt>();
  private directory:string;
  constructor(private store:DshTaskWorkspace,private business:Business,private valid:()=>Promise<void>){
    this.directory=path.join(store.root,'executions');
  }
  private url(t:TaskTarget){return `/api/v1/work-execution/${t.kind}/${t.taskId}`;}
  private async save(r:Receipt){
    await mkdir(this.directory,{recursive:true});
    const file=path.join(this.directory,taskKey(r.target)+'.json'),temp=file+'.'+randomUUID()+'.tmp';
    await writeFile(temp,JSON.stringify(r),{mode:0o600});await rename(temp,file);
    this.receipts.set(taskKey(r.target),r);
  }
  async start(){
    await mkdir(this.directory,{recursive:true});
    for(const file of await readdir(this.directory))if(file.endsWith('.json')){
      const r=JSON.parse(await readFile(path.join(this.directory,file),'utf8')) as Receipt;
      if(file!==taskKey(r.target)+'.json')throw Error('本机执行记录损坏。');
      this.receipts.set(taskKey(r.target),r);
    }
    await this.business('/api/v1/work/devices/heartbeat',{deviceId:await localDeviceId(this.store.root)});
    this.timer=setInterval(()=>{void this.tick().catch(()=>{});},5000);this.timer.unref();
  }
  dispose(){if(this.timer)clearInterval(this.timer);this.timer=undefined;}
  private report(r:Receipt,phase:'running'|'uncertain'|'finished'|'failed'|'stopped'){
    return this.business(this.url(r.target)+'/report',{executionId:r.execution.id,deviceId:r.execution.deviceId,requestId:r.execution.requestId,phase});
  }
  async idle(target:TaskTarget){
    const {execution}=await this.business(this.url(target));
    if(active(execution))throw Error('已有设备执行或结果待核对，请在原设备核对本轮结果后继续。');
  }
  async prompt(context:TaskContext,text:string,requestId:string,inputs:WorkInputs){
    // One bridge invocation per task, including claim and its local durable receipt.
    return this.store.exclusive({...context,taskId:context.taskId+'-lease'},async()=>{
      const before=await this.store.status(context);if(!before)throw Error('请先打开工作区。');
      const previous=this.receipts.get(taskKey(context));
      if(before.phase==='running'&&previous?.execution.requestId!==requestId)
        throw Error('本机会话已有运行，请先核对。');
      const deviceId=await localDeviceId(this.store.root);
      const execution:WorkExecution=await this.business(this.url(context)+'/claim',{deviceId,requestId},requestId);
      if(!active(execution))return; // A retried acknowledgement cannot execute a completed request twice.
      let r=this.receipts.get(taskKey(context));
      if(r&&r.execution.id!==execution.id)throw Error('上一轮本机回执尚未核对。');
      if(!r){
        if(before.phase==='running')throw Error('本机会话已有运行，请先核对。');
        r={target:{kind:context.kind,taskId:context.taskId},execution,sessionId:before.binding.sessionId,baseline:Math.max(0,...before.events.map(e=>e.seq))};
        await this.save(r);
      }
      await this.report(r,'running');
      try{
        await this.store.prompt(context,text,requestId,inputs);
        const b=await this.store.load(context);
        if(b&&b.sessionId!==r.sessionId){r.sessionId=b.sessionId;r.baseline=0;await this.save(r);}
      }catch(error){await this.report(r,'uncertain').catch(()=>{});throw error;}
    });
  }
  async tick(){
    if(this.busy)return;this.busy=true;
    try{
      try{await this.valid();}catch{this.dispose();return;}
      await this.business('/api/v1/work/devices/heartbeat',{deviceId:await localDeviceId(this.store.root)}).catch(()=>{});
      for(const r of this.receipts.values()){
        try{
          const state=await this.store.status(r.target);
          if(!state||state.binding.sessionId!==r.sessionId){await this.report(r,'uncertain');continue;}
          const end=[...state.events].reverse().find(e=>e.type==='turn/end'&&e.seq>r.baseline);
          // queue acceptance, idle session, or an old turn/end alone is never proof of completion.
          if(end&&state.phase!=='running'){
            const phase=end.data.reason?.kind==='completed'?'finished':end.data.reason?.kind==='aborted'?'stopped':'failed';
            await this.report(r,phase);
            await unlink(path.join(this.directory,taskKey(r.target)+'.json'));
            this.receipts.delete(taskKey(r.target));continue;
          }
          const attempts=state.events.filter(e=>e.seq>r.baseline&&e.type==='assistant/attempt').length;
          if(Date.now()>=Date.parse(r.execution.deadlineAt)||attempts>=12){
            await this.store.cancel(r.target);await this.report(r,'uncertain');continue;
          }
          await this.report(r,'running');
        }catch{
          // Permission revocation/network loss stops local work; retain the lock until a terminal event can be verified.
          await this.store.cancel(r.target).catch(()=>{});
          await this.report(r,'uncertain').catch(()=>{});
        }
      }
    }finally{this.busy=false;}
  }
}
