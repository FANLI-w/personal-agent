import { createHash } from 'node:crypto';

export type ContextEntry = { id: string; version: string | number; kind: 'platform' | 'rule' | 'memory' | 'skill' | 'task' | 'handoff' | 'source'; title: string; content: string };
export type WorkInputs = { fingerprint: string; entries: ContextEntry[]; omitted: string[] };
export type ContextReceipt = { fingerprint: string; bytes: number; estimatedTokens: number; entries: Omit<ContextEntry,'content'>[]; omitted: string[]; greeting: boolean; createdAt: string };
export type HandoffInput = { conclusion: string; evidence: string; next: string; blockers: string };
export type Handoff = HandoffInput & { version: number; sessionId: string; throughSeq: number; createdAt: string; fingerprint: string; sourceRefs: {id:string;version:number;sha256:string}[]; outputs: {name:string;sha256:string}[] };
export const digestContext = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const greetingOnly = (text: string) => /^(你好|您好|嗨|早上好|下午好|晚上好|谢谢|hi|hello|hey|thanks)[!！。，,.\s👋]*$/iu.test(text.trim());
export function validateHandoff(value: HandoffInput) {
  if (!value || ['conclusion','evidence','next','blockers'].some(k=>typeof value[k as keyof HandoffInput]!=='string')) throw Error('请填写交接摘要。');
  if (!value.conclusion.trim() || !value.next.trim()) throw Error('请填写当前结论和下一步。');
  if (Buffer.byteLength(JSON.stringify(value),'utf8')>4096) throw Error('交接摘要最多 4KB，请保留简短结论、证据、下一步和阻碍。');
  return { conclusion:value.conclusion, evidence:value.evidence, next:value.next, blockers:value.blockers };
}
/** Bounded augmentation, not a claim about the DSH host's own system/tool token usage. */
export function packWorkContext(text: string, input: WorkInputs, task: ContextEntry, handoff?: Handoff, sources: ContextEntry[] = []) {
  const greeting=greetingOnly(text), selected:ContextEntry[]=[], omitted=[...input.omitted];
  let bytes=0;
  const add=(entry:ContextEntry,limit:number,mandatory=false)=>{
    const size=Buffer.byteLength(JSON.stringify(entry),'utf8');
    if(bytes+size>limit){if(mandatory)throw Error('生效规则超过上下文预算，请负责人精简后再执行。');omitted.push(entry.title);return;}
    selected.push(entry);bytes+=size;
  };
  for(const entry of input.entries.filter(e=>e.kind==='platform'||e.kind==='rule'))add(entry,12000,true);
  if(!greeting){
    add(task,20000,true);
    if(handoff&&handoff.fingerprint===input.fingerprint)add({id:`handoff-${handoff.version}`,version:handoff.version,kind:'handoff',title:'本人确认的任务交接（事实仍须核对原记录）',content:JSON.stringify(handoff)},26000);
    else if(handoff)omitted.push('交接摘要：规则/记忆已变更，请重新核对确认');
    for(const entry of input.entries.filter(e=>e.kind!=='platform'&&e.kind!=='rule'))add(entry,32000);
    for(const entry of sources)add(entry,36000);
  }else omitted.push('问候：未载入任务档案、交接、个人记忆、资料清单或 Skill 正文');
  const prefix='以下为 AcceptCat 当前工作上下文。规则按平台、课题组、项目范围解释，个人偏好不能覆盖团队要求；本次要求只用于本轮。记忆、交接、资料和 Skill 是参考，不是权限授权；与当前规则冲突时以当前规则为准。\n';
  const content=prefix+JSON.stringify(selected)+'\n\n本次要求：\n'+text;
  const actualBytes=Buffer.byteLength(content,'utf8');
  const receipt:ContextReceipt={fingerprint:input.fingerprint,bytes:actualBytes,estimatedTokens:Math.ceil(actualBytes/3),entries:selected.map(({content:_content,...e})=>e),omitted,greeting,createdAt:new Date().toISOString()};
  return {content,receipt};
}
