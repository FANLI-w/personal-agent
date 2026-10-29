import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile, readdir, stat, rm, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { ResearchOriginalUpload, researchUploadChunkBytes as chunkBytes } from '@research-agent-platform/contracts'
import type { z } from 'zod'
import { fail } from './errors.js'
import type { ResearchLibraryService } from './research-library.js'

type Manifest = {collectionId:string;input:z.infer<typeof ResearchOriginalUpload>}
/** Immutable chunks on disk. SQLite is used only when publishing the complete original. */
export class ResearchUploads {
  private root:string
  private prefix:string
  constructor(private library:ResearchLibraryService){
    if(!library.blobRoot)fail('SERVICE_UNAVAILABLE')
    this.root=join(library.blobRoot,'.uploads')
    this.prefix=createHash('sha256').update(library.actor.id).digest('hex')+'-'
  }
  private dir(id:string){if(!/^[0-9a-f-]{36}$/i.test(id))fail('VALIDATION_ERROR');return join(this.root,this.prefix+id)}
  async manifest(collectionId:string,id:string){
    let m:Manifest
    try {m=JSON.parse(await readFile(join(this.dir(id),'manifest.json'),'utf8')) as Manifest}
    catch {fail('NOT_FOUND')}
    if(m.collectionId!==collectionId)fail('NOT_FOUND')
    m.input=ResearchOriginalUpload.parse(m.input)
    this.library.authorizeOriginal(collectionId,m.input)
    return m
  }
  async begin(collectionId:string,raw:z.input<typeof ResearchOriginalUpload>){
    const input=ResearchOriginalUpload.parse(raw)
    this.library.authorizeOriginal(collectionId,input)
    await mkdir(this.root,{recursive:true})
    // Expired chunks are disposable; published files and idempotency receipts live outside this directory.
    for(const e of await readdir(this.root,{withFileTypes:true}))if(e.isDirectory()&&/^[a-f0-9]{64}-[a-f0-9-]{36}$/i.test(e.name)){
      const d=join(this.root,e.name),s=await stat(d).catch(()=>null)
      if(s&&Date.now()-s.mtimeMs>24*60*60*1000)await rm(d,{recursive:true,force:true})
    }
    const dir=this.dir(input.uploadId),value=JSON.stringify({collectionId,input})
    const exists=await readFile(join(dir,'manifest.json'),'utf8').catch(()=>undefined)
    if(exists!==undefined){if(exists!==value)fail('IDEMPOTENCY_CONFLICT')}
    else {
      const own=(await readdir(this.root)).filter(n=>n.startsWith(this.prefix))
      if(own.length>=5)fail('RATE_LIMITED')
      await mkdir(dir,{recursive:true})
      try {await writeFile(join(dir,'manifest.json'),value,{flag:'wx',mode:0o600})}
      catch {if(await readFile(join(dir,'manifest.json'),'utf8')!==value)fail('IDEMPOTENCY_CONFLICT')}
    }
    return {uploadId:input.uploadId,chunkBytes,receivedParts:(await readdir(dir)).filter(n=>/^\d+\.part$/.test(n)).map(n=>Number(n.split('.')[0])).sort((a,b)=>a-b)}
  }
  async part(collectionId:string,body:{uploadId:string;index:number;contentBase64:string}){
    const m=await this.manifest(collectionId,body.uploadId),bytes=Buffer.from(body.contentBase64,'base64')
    const expected=Math.min(chunkBytes,m.input.byteLength-body.index*chunkBytes)
    if(expected<=0||bytes.length!==expected||bytes.toString('base64')!==body.contentBase64)fail('VALIDATION_ERROR')
    const file=join(this.dir(body.uploadId),`${body.index}.part`),temp=file+'.'+randomUUID()+'.tmp'
    const previous=await readFile(file).catch(()=>undefined)
    if(previous){if(!previous.equals(bytes))fail('IDEMPOTENCY_CONFLICT');return {accepted:true as const}}
    // Atomic publish, including simultaneous retransmission of the same part.
    await writeFile(temp,bytes,{flag:'wx',mode:0o600})
    try {
      const { link }=await import('node:fs/promises')
      try {await link(temp,file)}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;if(!(await readFile(file)).equals(bytes))fail('IDEMPOTENCY_CONFLICT')}
    } finally {await unlink(temp).catch(()=>{})}
    return {accepted:true as const}
  }
  async assemble(collectionId:string,id:string){
    const m=await this.manifest(collectionId,id),hash=createHash('sha256'),output=join(this.library.blobRoot!,`${randomUUID()}.upload`)
    const dir=this.dir(id),parts=Math.ceil(m.input.byteLength/chunkBytes)
    let size=0
    async function* chunks(){for(let index=0;index<parts;index++){
      const file=join(dir,`${index}.part`),s=await stat(file).catch(()=>null)
      if(!s||s.size!==Math.min(chunkBytes,m.input.byteLength-index*chunkBytes))fail('INVALID_STATE')
      for await(const bytes of createReadStream(file))yield bytes
    }}
    try {
      await pipeline(chunks(),new Transform({transform(bytes,_encoding,done){size+=bytes.length;hash.update(bytes);done(null,bytes)}}),createWriteStream(output,{flags:'wx',mode:0o600}))
      const sha256=hash.digest('hex')
      if(size!==m.input.byteLength||(m.input.sha256&&m.input.sha256!==sha256))fail('VALIDATION_ERROR')
      return {input:m.input,path:output,byteLength:size,sha256}
    } catch(error){await unlink(output).catch(()=>{});throw error}
  }
  async clear(id:string){await rm(this.dir(id),{recursive:true,force:true})}
}
