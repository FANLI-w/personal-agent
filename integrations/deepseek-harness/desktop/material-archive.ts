import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, stat, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { copyLocalMaterial, originalLimit } from './local-material-files';

export type ArchiveSelection = {
  requestId: string; collectionId: string; collectionName: string;
  scope: 'owner_private' | 'task_scoped' | 'lab_shared' | 'public';
  expectedCollectionVersion: number; names: string[];
};
export type ArchiveReceipt = ArchiveSelection & {
  status: 'pending' | 'archived'; versionConflict?: boolean;
  transfer?: {name:string;bytes:number;total:number};
  files: { name: string; id: string; version: number; sha256: string; extraction: string }[];
};
type Journal = { receipt: ArchiveReceipt; nextVersion: number; items: { key: string; body: Record<string, unknown>; large?:{snapshot:string;begin:Record<string,unknown>;ready?:boolean} }[] };
export function materialMediaType(name: string) {
  const types: Record<string, string> = {
    '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.md': 'text/markdown', '.txt': 'text/plain', '.csv': 'text/csv', '.tsv': 'text/tab-separated-values',
    '.json': 'application/json', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return types[path.extname(name).toLowerCase()] || 'application/octet-stream';
}

/** Local durable outbox: retries send the original bytes, never a subsequently edited file. */
export async function archiveTaskFiles(options: {
  root: string; taskKey: string; taskId: string; selection: ArchiveSelection;
  current?: ArchiveReceipt; rebase?: boolean;
  read: (name: string) => Promise<Buffer>; valid: () => Promise<void>;
  sourcePath?: (name:string) => Promise<string>;
  checkCollection: () => Promise<void>;
  save: (receipt: ArchiveReceipt) => Promise<void>;
  post: (url: string, body: unknown, key: string) => Promise<any>;
}) {
  const { selection: s } = options;
  if (!s || !/^[A-Za-z0-9_-]{16,128}$/.test(s.requestId) || !/^[A-Za-z0-9_-]{1,128}$/.test(s.collectionId)
    || typeof s.collectionName !== 'string' || s.collectionName.length > 200
    || !['owner_private', 'task_scoped', 'lab_shared', 'public'].includes(s.scope)
    || !Number.isSafeInteger(s.expectedCollectionVersion) || s.expectedCollectionVersion < 1
    || !Array.isArray(s.names) || !s.names.length || s.names.length > 5
    || s.names.some(n => typeof n !== 'string') || new Set(s.names).size !== s.names.length)
    throw Error('请选择资料集合和 1 至 5 个成果文件。');
  if (options.current?.status === 'pending' && options.current.requestId !== s.requestId)
    throw Error('还有一批归档结果待核对，请先重试原归档。');
  const file = path.join(options.root, `${options.taskKey}.archive.${s.requestId}.json`);
  let journal: Journal | undefined;
  try { journal = JSON.parse(await readFile(file, 'utf8')); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  const persist = async () => {
    await options.valid();
    const temp = file + '.' + randomUUID() + '.tmp';
    await writeFile(temp, JSON.stringify(journal), { mode: 0o600 });
    await rename(temp, file);
    await options.save(journal!.receipt);
  };
  await options.checkCollection();
  if (journal) {
    const r = journal.receipt;
    if (r.requestId !== s.requestId || r.collectionId !== s.collectionId || r.scope !== s.scope
      || JSON.stringify(r.names) !== JSON.stringify(s.names)) throw Error('请核对并重试原归档，不能更换文件或共享范围。');
    if (r.status === 'archived') { await options.save(r); return r; }
    if (options.rebase) {
      if (!r.versionConflict) throw Error('归档回执尚不明确，请先重试原请求。');
      journal.nextVersion = s.expectedCollectionVersion;
      const item = journal.items[r.files.length];
      item.key = randomUUID(); // Only a definite rejection allows a new server intent.
      item.body.expectedCollectionVersion = journal.nextVersion;
      r.versionConflict = false;
      await persist();
    }
  } else {
    if (options.rebase) throw Error('未找到待核对的原归档。');
    const items:Journal['items'] = [];
    try { for (const name of s.names) {
      const filename = path.basename(name);
      if (filename.length > 200) throw Error('文件名过长，请在本机缩短后归档。');
      const source = options.sourcePath ? await options.sourcePath(name) : undefined;
      const info = source ? await stat(source) : undefined;
      if (info && (!info.isFile() || info.size > originalLimit)) throw Error('共享原件不能超过 512 MiB；本地工作不受此限制。');
      if (source && info!.size > 10485760) {
        const snapshot = `${options.taskKey}.archive.${s.requestId}.${randomUUID()}.snapshot`;
        const copied = await copyLocalMaterial(source,path.join(options.root,snapshot),originalLimit);
        const uploadId = randomUUID();
        items.push({key:randomUUID(),body:{uploadId,expectedCollectionVersion:s.expectedCollectionVersion+items.length},large:{snapshot,begin:{uploadId,filename,mediaType:materialMediaType(name),byteLength:copied.size,sha256:copied.sha256,scope:s.scope,metadata:{note:`由 AcceptCat 任务 ${options.taskId} 明确选择归档；归档不代表任务已验收。`}}}});
        continue;
      }
      const bytes = await options.read(name);
      items.push({ key: randomUUID(), body: {
        filename, mediaType: materialMediaType(name), contentBase64: bytes.toString('base64'),
        expectedCollectionVersion: s.expectedCollectionVersion + items.length,
        metadata: { note: `由 AcceptCat 任务 ${options.taskId} 明确选择归档；归档不代表任务已验收。` },
      } });
    }} catch(error) {for(const item of items)if(item.large)await unlink(path.join(options.root,item.large.snapshot)).catch(()=>{});throw error;}
    journal = { receipt: { ...s, status: 'pending', files: [] }, nextVersion: s.expectedCollectionVersion, items };
    await persist();
  }
  try {
    for (let i = journal.receipt.files.length; i < journal.items.length; i++) {
      await options.valid();
      await options.checkCollection();
      const item = journal.items[i];
      const base = `/api/v1/research-library/collections/${s.collectionId}`;
      let result:any;
      if(item.large) {
        if(item.large.ready) {
          try { result = await options.post(base+'/uploads/complete',item.body,item.key); }
          catch(error) { if((error as {code?:string}).code !== 'NOT_FOUND') throw error; item.large.ready=false; }
        }
        if(!result) {
          const started = await options.post(base+'/uploads',item.large.begin,String(item.large.begin.uploadId));
          const snapshotPath=path.join(options.root,path.basename(item.large.snapshot));
          const handle=await open(snapshotPath,'r'),total=Number(item.large.begin.byteLength),chunkBytes=1048576;
          try {
            for(let part=0;part<Math.ceil(total/chunkBytes);part++) {
              await options.valid();
              if(!started.receivedParts.includes(part)) {
                const bytes=Buffer.alloc(Math.min(chunkBytes,total-part*chunkBytes));
                const read=await handle.read(bytes,0,bytes.length,part*chunkBytes);
                if(read.bytesRead!==bytes.length)throw Error('本机归档快照不完整，请保留原文件并核对。');
                await options.post(base+'/uploads/parts',{uploadId:item.large.begin.uploadId,index:part,contentBase64:bytes.toString('base64')},`${item.large.begin.uploadId}-${part}`);
              }
              journal.receipt.transfer={name:s.names[i],bytes:Math.min(total,(part+1)*chunkBytes),total};
              if(part%8===0)await persist();
            }
          } finally { await handle.close(); }
          item.large.ready=true; await persist(); await options.checkCollection();
          result=await options.post(base+'/uploads/complete',item.body,item.key);
        }
      } else result = await options.post(base+'/files', item.body, item.key);
      journal.receipt.transfer=undefined;
      journal.receipt.files.push({ name: s.names[i], id: result.id, version: result.version, sha256: result.sha256, extraction: result.extraction });
      journal.nextVersion = Number(item.body.expectedCollectionVersion) + 1;
      // An explicit conflict rebase can change the starting version of the remaining batch.
      if (journal.items[i + 1]) journal.items[i + 1].body.expectedCollectionVersion = journal.nextVersion;
      await persist();
    }
    journal.receipt.status = 'archived';
    await persist();
    for(const item of journal.items)if(item.large)await unlink(path.join(options.root,path.basename(item.large.snapshot))).catch(()=>{});
    return journal.receipt;
  } catch (e) {
    if ((e as { code?: string }).code === 'VERSION_CONFLICT') {
      journal.receipt.versionConflict = true;
      await persist();
    }
    throw e;
  }
}
