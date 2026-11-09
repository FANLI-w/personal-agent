import { z } from 'zod'
import { Id, Instant, Version, ErrorResponse, errorStatus, data } from './models.js'

export const TeamRepositoryUrl = z.string().max(500).refine(value => {
  try {
    const u = new URL(value)
    return u.protocol === 'https:' && u.hostname === 'github.com' && !u.port && !u.username && !u.password && !u.search && !u.hash && /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(u.pathname)
  } catch { return false }
}, '请输入不含凭证的 GitHub HTTPS 仓库地址')
export const TeamRepositoryInput = z.strictObject({
  url: TeamRepositoryUrl,
  branch: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_/-]{0,120}$/).refine(s => !s.includes('..') && !s.endsWith('/')),
  workspaceId: Id,
})
export const TeamRepositoryBinding = TeamRepositoryInput.extend({ labId: Id, version: Version, updatedAt: Instant, updatedBy: Id })
export type TeamRepositoryBinding = z.infer<typeof TeamRepositoryBinding>
export const TeamLibraryPath = z.string().min(1).max(500).refine(s => !/[\\:\x00-\x1f<>"|?*]/.test(s) && !s.startsWith('/') && s.split('/').every(p => p && !p.startsWith('.') && !/[. ]$/.test(p) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))
export const TeamLibraryPurpose = z.enum(['background','rule','template','reference','figure','evidence','output','other'])
export const TeamLibraryEntry = z.strictObject({
  id: Id, projectId: Id, name: z.string().min(1).max(200), purpose: TeamLibraryPurpose,
  summary: z.string().max(4000), maintainer: z.string().max(100), recommended: z.boolean(),
  source: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('git'), path: TeamLibraryPath, sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
    z.strictObject({ kind: z.literal('shared'), fileId: Id, version: Version, sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
    z.strictObject({ kind: z.literal('local'), path: TeamLibraryPath, sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable() }),
  ]),
})
export type TeamLibraryEntry = z.infer<typeof TeamLibraryEntry>
export const TeamLibraryManifest = z.strictObject({
  format: z.literal(1), workspaceId: Id, title: z.string().min(1).max(100),
  projects: z.array(z.strictObject({ id: Id, name: z.string().min(1).max(100), description: z.string().max(2000) })).max(100),
  entries: z.array(TeamLibraryEntry).max(1000),
}).superRefine((m,c) => {
  const projects = new Set(m.projects.map(p=>p.id)), entries = new Set(m.entries.map(e=>e.id))
  if(projects.size!==m.projects.length || entries.size!==m.entries.length || m.entries.some(e=>!projects.has(e.projectId))) c.addIssue({code:'custom',message:'项目/资料ID必须唯一，资料须属于已声明项目'})
})
export type TeamLibraryManifest = z.infer<typeof TeamLibraryManifest>
const empty=z.strictObject({})
const status=z.strictObject({binding:TeamRepositoryBinding.nullable(),canConfigure:z.boolean()})
function route<B extends z.ZodType>(method:'GET'|'POST',body:B){return {
  method,path:'/api/v1/library/repository',stage:'GITLIB1' as const,status:200,access:'session',implemented:true,idempotent:method==='POST',
  rule:'Live lab membership before read/replay; manager-only versioned repository binding. No Git credentials, file bytes, clones or remote requests on the API server.',
  request:z.strictObject({params:empty,query:empty,headers:method==='GET'?empty:z.strictObject({'Idempotency-Key':z.string().regex(/^[A-Za-z0-9_-]{16,128}$/)}),body}),response:data(status),errors:ErrorResponse,errorStatuses:errorStatus,
}}
export const teamLibraryRoutes={
  teamRepository:route('GET',z.null()),
  saveTeamRepository:route('POST',TeamRepositoryInput.extend({expectedVersion:z.number().int().nonnegative()})),
} as const
