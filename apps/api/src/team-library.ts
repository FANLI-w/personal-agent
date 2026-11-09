import { TeamRepositoryBinding, type RequestFor, type teamLibraryRoutes } from '@research-agent-platform/contracts'
import type { ChatService } from './chat.js'
import { isLabManager } from './invite-management.js'
import { hash } from './auth.js'
import { fail } from './errors.js'

export function runTeamLibrary(s:ChatService,name:keyof typeof teamLibraryRoutes,req:RequestFor<keyof typeof teamLibraryRoutes>){
  const c=s.c, lab=c.labId, manager=isLabManager(s.db,c.actor)
  const read=()=>{const row=s.db.prepare('SELECT document FROM team_library_repositories WHERE lab_id=?').get(lab);return row?TeamRepositoryBinding.parse(JSON.parse(String(row.document))):null}
  if(name==='teamRepository')return {data:{binding:read(),canConfigure:manager}}
  if(!manager)fail('FORBIDDEN')
  const body=(req as RequestFor<'saveTeamRepository'>).body,key=req.headers['Idempotency-Key']!,digest=hash(JSON.stringify(body))
  const oldCommand=s.db.prepare('SELECT request_hash,response_json FROM idempotency_results WHERE actor_id=? AND command=? AND resource_id=? AND key=?').get(c.actor.id,name,lab,key)
  if(oldCommand){if(oldCommand.request_hash!==digest)fail('IDEMPOTENCY_CONFLICT');return JSON.parse(String(oldCommand.response_json))}
  const old=read();if((old?.version??0)!==body.expectedVersion)fail('VERSION_CONFLICT')
  const binding=TeamRepositoryBinding.parse({url:body.url,branch:body.branch,workspaceId:body.workspaceId,labId:lab,version:(old?.version??0)+1,updatedAt:new Date().toISOString(),updatedBy:c.actor.id})
  s.db.prepare('INSERT INTO team_library_repositories VALUES(?,?,?) ON CONFLICT(lab_id) DO UPDATE SET version=excluded.version,document=excluded.document').run(lab,binding.version,JSON.stringify(binding))
  const result={data:{binding,canConfigure:true}}
  s.db.prepare('INSERT INTO idempotency_results(actor_id,command,resource_id,key,request_hash,response_json,http_status,created_at) VALUES(?,?,?,?,?,?,?,?)').run(c.actor.id,name,lab,key,digest,JSON.stringify(result),200,binding.updatedAt)
  return result
}
