import { createHash, randomBytes } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { routes } from '@research-agent-platform/contracts'
import type { PlanModel, RequestFor, ResponseFor, RouteName } from '@research-agent-platform/contracts'
import { openDatabase, migrate, seed, transaction } from '../src/database.js'
import { provisionTestAccounts, passwordHash } from '../src/auth.js'
import { Collaboration } from '../src/collaboration.js'

const origin = 'http://127.0.0.1:4173'
const schedule = { suggested: null, hardDeadline: null, committed: null, estimatedHumanHours: null, checkpoint: null }
type Client = { cookie: string; csrf: string }
const accounts = ['A', 'B', 'C'].map(letter => ({ memberId: `member_${letter}`, username: `synthetic_${letter.toLowerCase()}`, password: randomBytes(24).toString('hex') }))
let directory: string, databasePath: string, address: string, secondAddress: string
let db: ReturnType<typeof openDatabase>
let clients: Record<'A' | 'B' | 'C', Client>
const children = new Set<ChildProcess>()
let counter = 0
const key = () => `b2b_synthetic_command_${++counter}`

async function startServer() {
  const child = spawn(process.execPath, [resolve('apps/api/dist/main.js')], { env: { ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '0', APP_ORIGIN: origin, DATABASE_PATH: databasePath, BLOB_ROOT: join(directory, 'blobs') }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  children.add(child)
  const url = await new Promise<string>((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => reject(new Error('server startup timeout')), 10000)
    child.stdout!.on('data', chunk => { output += chunk; const match = /listening (http:\/\/127\.0\.0\.1:\d+);/.exec(output); if (match) { clearTimeout(timer); resolve(match[1]!) } })
    child.once('error', err => { clearTimeout(timer); reject(err) })
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`server startup failed ${code}`)) })
  })
  return { child, url }
}
async function stopServers() {
  for (const child of children) {
    if (child.exitCode === null) { const stopped = once(child, 'exit'); child.kill(); await stopped }
  }
  children.clear()
}
type Options = { body?: unknown; params?: { id: string }; query?: Record<string, unknown>; client?: Client; key?: string; target?: string; headers?: Record<string, string> }
async function request<K extends RouteName>(name: K, options: Options = {}) {
  const route = routes[name]
  const path = route.path.replace('{id}', options.params?.id ?? 'synthetic')
  const url = new URL(path, options.target ?? address)
  for (const [k, v] of Object.entries(options.query ?? {})) url.searchParams.set(k, String(v))
  const response = await fetch(url, { method: route.method, headers: { ...(route.method === 'GET' ? {} : { 'content-type': 'application/json', origin }), ...(options.client ? { cookie: options.client.cookie, 'x-csrf-token': options.client.csrf } : {}), ...(route.idempotent ? { 'Idempotency-Key': options.key ?? key() } : {}), ...options.headers }, ...(route.method === 'GET' ? {} : { body: JSON.stringify(options.body ?? {}) }) })
  const raw: unknown = await response.json()
  if (response.ok) route.response.parse(raw)
  else if (name !== 'ready') route.errors.parse(raw)
  return { status: response.status, response, value: raw as ResponseFor<K> & { error?: { code: string } } }
}
async function loginAs(letter: 'A' | 'B' | 'C', prior?: Client) {
  const account = accounts.find(a => a.memberId === `member_${letter}`)!
  const login = await request('login', { body: { username: account.username, password: account.password }, client: prior })
  expect(login.status).toBe(200)
  const cookie = login.response.headers.get('set-cookie')!.split(';')[0]!
  expect(login.response.headers.get('set-cookie')).toContain('HttpOnly')
  expect(login.response.headers.get('set-cookie')).toContain('SameSite=Lax')
  const client = { cookie, csrf: '' }
  const session = await request('session', { client })
  expect(session.status).toBe(200)
  client.csrf = session.value.data.csrfToken
  return client
}
function item(kind: 'invitation' | 'claim' | 'self', itemId = 'item_one'): PlanModel['proposedItems'][number] {
  return { id: itemId, title: 'Synthetic collaboration', goal: 'RESTRICTED_INPUT_SENTINEL', deliverable: 'Public offered text checklist', acceptanceCriteria: 'List missing items explicitly', allocation: kind === 'invitation' ? { kind, memberId: 'member_B' } : kind === 'claim' ? { kind, audience: 'lab_members', summary: 'Safe claim summary' } : { kind }, dependencies: [], schedule, inputArtifactIds: [], budget: null }
}
function planInput(items = [item('invitation')]): RequestFor<'createPlan'>['body'] { return { labId: 'lab_synthetic', goal: 'Owner-only planning notes', proposedItems: items, unresolvedQuestions: [] } }
async function createConfirmed(items = [item('invitation')]) {
  const created = await request('createPlan', { client: clients.A, body: planInput(items) }); expect(created.status).toBe(201)
  const confirmation = await request('confirmPlan', { client: clients.A, params: { id: created.value.data.id }, body: { expectedVersion: created.value.data.version } }); expect(confirmation.status).toBe(200)
  return confirmation.value.data
}
async function detail(taskId: string, client = clients.A) {
  const result = await request('task', { client, params: { id: taskId } }); expect(result.status).toBe(200)
  if (!('task' in result.value.data)) throw new Error('Expected authorized task detail')
  return result.value.data
}
async function accept(taskId: string) {
  const summary = await request('task', { client: clients.B, params: { id: taskId } })
  if (!('pendingInvitation' in summary.value.data) || !summary.value.data.pendingInvitation) throw new Error('Expected invitation summary')
  const offer = summary.value.data.pendingInvitation
  const result = await request('invitationDecision', { client: clients.B, params: { id: offer.id }, body: { expectedVersion: offer.version, expectedTaskVersion: summary.value.data.version, decision: 'accepted', comment: null } })
  expect(result.status).toBe(200)
  return result
}

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'rap-b2b-http-')); databasePath = join(directory, 'platform.sqlite'); mkdirSync(join(directory, 'blobs'))
  db = openDatabase(databasePath, true); migrate(db); seed(db, 'test'); seed(db, 'test')
  await provisionTestAccounts(db, 'test', accounts); await provisionTestAccounts(db, 'test', accounts)
  address = (await startServer()).url; secondAddress = (await startServer()).url
  clients = { A: await loginAs('A'), B: await loginAs('B'), C: await loginAs('C') }
}, 30000)
afterAll(async () => { await stopServers(); db?.close(); if (directory) rmSync(directory, { recursive: true, force: true }) })

async function command<K extends RouteName>(name: K, taskId: string, client: Client, body: Record<string,unknown> = {}) {
  const t=(await detail(taskId,client)).task
  return request(name,{client,params:{id:taskId},body:{expectedVersion:t.version,...body}})
}
async function finish(taskId:string, client=clients.A) {
  let t=(await detail(taskId,client)).task
  if(t.status==='ready') { const r=await command('start',taskId,client);expect(r.status).toBe(200) }
  const submitted=await command('submit',taskId,client,{summary:'Synthetic preserved result',artifactRefs:[],sources:[]});expect(submitted.status).toBe(201)
  t=(await detail(taskId)).task
  const review=await request('review',{client:clients.A,params:{id:submitted.value.data.id},body:{expectedVersion:1,expectedTaskVersion:t.version,revision:submitted.value.data.revision,decision:'accepted',comment:'Synthetic acceptance'}});expect(review.status).toBe(200)
  return review.value.data
}
async function propose(taskId:string, extra:Record<string,unknown>={}, client=clients.A) {
  const t=(await detail(taskId,client)).task
  return command('proposeChange',taskId,client,{scope:'Revised synthetic scope',goal:t.goal,acceptanceCriteria:t.acceptanceCriteria,schedule:t.schedule,dependencies:t.dependencies,proposedLeadId:t.leadId,reason:'Synthetic negotiated change',...extra})
}
async function decide(proposalId:string, version:number, decision:'accepted'|'declined', client=clients.B, target=address) {
  return request('decideChange',{client,params:{id:proposalId},body:{expectedVersion:version,decision},target})
}
async function upload(taskId:string, client=clients.B, text='Synthetic attachment') {
  const t=(await detail(taskId,client)).task
  const input={client,body:{taskId,expectedVersion:t.version,filename:'synthetic.txt',mediaType:'text/plain',contentBase64:Buffer.from(text).toString('base64')},key:key()}
  const r=await request('upload',input);expect(r.status).toBe(201);return {r,input}
}
async function download(id:string,client:Client) {return fetch(new URL(routes.content.path.replace('{id}',id),address),{headers:{cookie:client.cookie}})}

describe('safe task recovery',()=>{
  it('does not acknowledge transitive evidence changes or restore old downstream submissions',async()=>{
    const u=item('self','u'),v=item('self','v'),w=item('self','w');v.dependencies=['u'];w.dependencies=['v']
    const {taskIds}=await createConfirmed([u,v,w]);const [up,middle,down]=taskIds as [string,string,string]
    await finish(up);await finish(middle)
    expect((await command('start',down,clients.A)).status).toBe(200)
    expect((await command('submit',down,clients.A,{summary:'Old evidence preserved',artifactRefs:[],sources:[]})).status).toBe(201)
    expect((await propose(up,{goal:'Changed upstream premise'})).status).toBe(201)
    await finish(up)
    const after=await detail(down),between=await detail(middle)
    expect(after.task.status).toBe('blocked');expect(after.task.blocker!.resumeStatus).toBe('in_review')
    expect(after.deliverables[0]!.summary).toBe('Old evidence preserved')
    expect(between.dependencyImpacts!.some(i=>!i.acknowledgedBy)).toBe(true)
    expect(after.dependencyImpacts!.some(i=>i.kind==='changed'&&!i.acknowledgedBy)).toBe(true)
    expect(after.dependencyImpacts!.some(i=>i.acknowledgedBy==='system')).toBe(false)
    expect((await command('resume',down,clients.A)).value.error?.code).toBe('DEPENDENCY_BLOCKED')
  })

  it.each(['invitation','claim'] as const)('keeps %s dependency revisions unbound until work starts and allows explicit reassessment',async(allocation)=>{
    const u=item('self','u'),v=item('self','v'),d=item(allocation,'d');d.dependencies=['u','v']
    const {taskIds}=await createConfirmed([u,v,d]);const [first,second,down]=taskIds as [string,string,string]
    await finish(first)
    if(allocation==='invitation')await accept(down)
    else {const offer=await request('task',{client:clients.B,params:{id:down}});if('task' in offer.value.data)throw new Error('Expected claim summary');expect((await request('claim',{client:clients.B,params:{id:down},body:{expectedVersion:offer.value.data.version}})).status).toBe(200)}
    expect(db.prepare('SELECT * FROM dependency_bindings WHERE task_id=?').all(down)).toHaveLength(0)
    const c=new Collaboration(db,{id:'member_B',labId:'lab_synthetic',csrfHash:'',expiresAt:'9999-12-31T00:00:00Z'})
    expect(()=>c.coordination.dependenciesReady(c.task(down),true)).toThrow('DEPENDENCY_BLOCKED')
    expect(db.prepare('SELECT * FROM dependency_bindings WHERE task_id=?').all(down)).toHaveLength(0)
    expect((await propose(first,{goal:'Updated first dependency'})).status).toBe(201)
    await finish(first);await finish(second)
    const after=await detail(down,clients.B)
    expect(after.task.status).toBe('blocked')
    expect((await command('acknowledgeImpacts',down,clients.B,{impactIds:after.dependencyImpacts!.filter(i=>!i.acknowledgedBy).map(i=>i.id),comment:'Explicitly reviewed the new evidence'})).status).toBe(200)
    expect((await command('resume',down,clients.B)).status).toBe(200)
    expect(db.prepare('SELECT revision FROM dependency_bindings WHERE task_id=? AND upstream_id=?').get(down,first)!.revision).toBe(2)
    expect((await command('start',down,clients.B)).status).toBe(200)
  })

  it.each(['invitation','claim'] as const)('auto-recovers an untouched %s only after all first-time prerequisites are accepted',async(allocation)=>{
    const u=item('self','u'),v=item('self','v'),d=item(allocation,'d');d.dependencies=['u','v']
    const {taskIds}=await createConfirmed([u,v,d]);const [first,second,down]=taskIds as [string,string,string]
    if(allocation==='invitation')await accept(down)
    else {const offer=await request('task',{client:clients.B,params:{id:down}});if('task' in offer.value.data)throw new Error('Expected claim summary');expect((await request('claim',{client:clients.B,params:{id:down},body:{expectedVersion:offer.value.data.version}})).status).toBe(200)}
    await finish(first);expect((await detail(down,clients.B)).task.status).toBe('blocked')
    await finish(second);expect((await detail(down,clients.B)).task.status).toBe('ready')
    expect(db.prepare('SELECT * FROM dependency_bindings WHERE task_id=?').all(down)).toHaveLength(0)
    expect((await command('start',down,clients.B)).status).toBe(200)
    expect(db.prepare('SELECT * FROM dependency_bindings WHERE task_id=?').all(down)).toHaveLength(2)
  })


})

