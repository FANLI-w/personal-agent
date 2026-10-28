import { z } from 'zod'
import { Id, Title, Text, Version, Instant, ErrorResponse, errorStatus, data } from './models.js'
import { WorkTarget } from './work-context.js'

export const WorkExecution = z.strictObject({
  id: Id, requestId: Id, deviceId: Id, actorId: Id,
  phase: z.enum(['claimed','running','uncertain','finished','failed','stopped']),
  startedAt: Instant, heartbeatAt: Instant, deadlineAt: Instant,
  rounds: z.number().int().nonnegative(), maxRounds: z.number().int().positive(),
})
export const TeamWorkItem = z.strictObject({
  id: Id, conversationId: Id, sourceMessageId: Id, taskId: Id,
  title: Title, agentContactId: Id, agentName: Title, ownerId: Id, ownerName: Title,
  status: z.string(), deviceOnline: z.boolean(), canOpen: z.boolean(),
  execution: WorkExecution.nullable(),
})
export type WorkExecution = z.infer<typeof WorkExecution>
export type TeamWorkItem = z.infer<typeof TeamWorkItem>
const empty = z.strictObject({}), id = z.strictObject({id:Id})
const headers = z.strictObject({'Idempotency-Key':z.string().regex(/^[A-Za-z0-9_-]{16,128}$/)})
function route<P extends z.ZodType,Q extends z.ZodType,B extends z.ZodType,R extends z.ZodType>(method:'GET'|'POST',path:string,params:P,query:Q,body:B,response:R,immediate=false) {
  return {method,path:'/api/v1'+path,stage:'TEAM1' as const,implemented:true,access:'session',status:200,
    rule:'Explicit group work, live task and group authority; one durable device execution at a time. Expiry never permits automatic takeover. Service receipts never trigger Agents.',
    idempotent:method==='POST'&&!immediate,request:z.strictObject({params,query,headers:method==='GET'||immediate?empty:headers,body}),response,errors:ErrorResponse,errorStatuses:errorStatus}
}
export const teamWorkRoutes = {
  teamWork:route('GET','/chat/conversations/{id}/team-work',id,empty,z.null(),data(z.array(TeamWorkItem).max(100))),
  createTeamWork:route('POST','/chat/conversations/{id}/team-work',id,empty,z.strictObject({
    sourceMessageId:Id,expectedConversationVersion:Version,
    assignments:z.array(z.strictObject({agentContactId:Id,title:Title,goal:Text})).min(1).max(5),
  }),data(z.array(TeamWorkItem).max(5))),
  workDevice:route('POST','/work/devices/heartbeat',empty,empty,z.strictObject({deviceId:Id}),data(z.strictObject({seenAt:Instant})),true),
  workExecution:route('GET','/work-execution/{kind}/{id}',WorkTarget,empty,z.null(),data(z.strictObject({execution:WorkExecution.nullable(),team:TeamWorkItem.nullable()}))),
  claimWorkExecution:route('POST','/work-execution/{kind}/{id}/claim',WorkTarget,empty,z.strictObject({deviceId:Id,requestId:Id}),data(WorkExecution)),
  reportWorkExecution:route('POST','/work-execution/{kind}/{id}/report',WorkTarget,empty,z.strictObject({
    executionId:Id,deviceId:Id,requestId:Id,phase:z.enum(['running','uncertain','finished','failed','stopped']),
  }),data(WorkExecution),true),
} as const
