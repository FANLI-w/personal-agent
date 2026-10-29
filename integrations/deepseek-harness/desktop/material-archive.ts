import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

export type ArchiveSelection = {
  requestId: string; collectionId: string; collectionName: string;
  scope: 'owner_private' | 'task_scoped' | 'lab_shared' | 'public';
  expectedCollectionVersion: number; names: string[];
};
export type ArchiveReceipt = ArchiveSelection & {
  status: 'pending' | 'archived'; versionConflict?: boolean;
  files: { name: string; id: string; version: number; sha256: string; extraction: string }[];
};
type Journal = { receipt: ArchiveReceipt; nextVersion: number; items: { key: string; body: Record<string, unknown> }[] };
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
    const items = [];
    for (const name of s.names) {
      const bytes = await options.read(name);
      const filename = path.basename(name);
      if (filename.length > 200) throw Error('文件名过长，请在本机缩短后归档。');
      items.push({ key: randomUUID(), body: {
        filename, mediaType: materialMediaType(name), contentBase64: bytes.toString('base64'),
        expectedCollectionVersion: s.expectedCollectionVersion + items.length,
        metadata: { note: `由 AcceptCat 任务 ${options.taskId} 明确选择归档；归档不代表任务已验收。` },
      } });
    }
    journal = { receipt: { ...s, status: 'pending', files: [] }, nextVersion: s.expectedCollectionVersion, items };
    await persist();
  }
  try {
    for (let i = journal.receipt.files.length; i < journal.items.length; i++) {
      await options.valid();
      await options.checkCollection();
      const item = journal.items[i];
      const result = await options.post(`/api/v1/research-library/collections/${s.collectionId}/files`, item.body, item.key);
      journal.receipt.files.push({ name: s.names[i], id: result.id, version: result.version, sha256: result.sha256, extraction: result.extraction });
      journal.nextVersion = Number(item.body.expectedCollectionVersion) + 1;
      // An explicit conflict rebase can change the starting version of the remaining batch.
      if (journal.items[i + 1]) journal.items[i + 1].body.expectedCollectionVersion = journal.nextVersion;
      await persist();
    }
    journal.receipt.status = 'archived';
    await persist();
    return journal.receipt;
  } catch (e) {
    if ((e as { code?: string }).code === 'VERSION_CONFLICT') {
      journal.receipt.versionConflict = true;
      await persist();
    }
    throw e;
  }
}
