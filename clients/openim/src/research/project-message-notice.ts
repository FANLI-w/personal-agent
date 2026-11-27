import type { ChatMessage, ChatMessageDetails, ProjectMessageNotice } from '@research-agent-platform/contracts';

export function isProjectNoticeCandidate(
  fact: Pick<ChatMessage, 'origin'|'senderContactId'|'turnId'|'resources'|'actionIds'>|undefined,
  reply: ChatMessageDetails['replyTo']|undefined,
  coordinator: boolean,
) {
  return !!fact && fact.origin === 'service' && !!fact.senderContactId && coordinator &&
    !fact.turnId && !fact.resources.length && !fact.actionIds.length &&
    !!reply?.senderContactId;
}

/** One non-polling lookup per eligible message/account generation. A legacy
 * backend is detected once; ordinary history never becomes a row polling loop. */
export function createProjectNoticeReader(
  read: (conversationId:string,messageId:string)=>Promise<ProjectMessageNotice|null>,
) {
  let scope:number|undefined,unsupported=false,capabilityKnown=false,capabilityProbe:Promise<void>|undefined;
  const values=new Map<string,Promise<ProjectMessageNotice|null>>();
  return (generation:number,conversationId:string,messageId:string) => {
    if(scope!==generation){scope=generation;unsupported=false;capabilityKnown=false;capabilityProbe=undefined;values.clear();}
    if(unsupported)return Promise.resolve(null);
    const key=JSON.stringify([conversationId,messageId]);
    const cached=values.get(key);if(cached)return cached;
    const lookup=()=>scope===generation&&unsupported?Promise.resolve(null):read(conversationId,messageId);
    // A page of old notices shares one initial capability probe. The first404
    // suppresses the rest before they can become separate legacy requests.
    const request=(capabilityProbe&&!capabilityKnown?capabilityProbe.then(lookup):lookup()).catch((error:unknown)=>{
      if((error as {status?:number})?.status===404){if(scope===generation)unsupported=true;return null;}
      if(scope===generation)values.delete(key);
      throw error;
    });
    if(!capabilityKnown&&!capabilityProbe)capabilityProbe=request.then(()=>{if(scope===generation)capabilityKnown=true;},()=>{if(scope===generation)capabilityProbe=undefined;});
    values.set(key,request);
    if(values.size>256)values.delete(values.keys().next().value!);
    return request;
  };
}
