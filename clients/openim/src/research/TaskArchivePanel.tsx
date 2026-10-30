import { Alert, Button, Modal, Select } from 'antd';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ResearchCollection } from '@research-agent-platform/contracts';
import type { TaskTarget, DshTaskState } from '../../../../integrations/deepseek-harness/desktop/task-workspace';
import type { ArchiveSelection } from '../../../../integrations/deepseek-harness/desktop/material-archive';
import { researchScopeLabels } from './research-library-api';
import { usePersonalOperation } from './usePersonalOperation';

export function TaskArchivePanel({ target, state, selected, collections, busy, command, refreshCollections }: {
  target: TaskTarget; state?: DshTaskState; selected: string[]; collections: ResearchCollection[];
  busy: boolean; command: (action: () => Promise<unknown>) => Promise<void>; refreshCollections: () => Promise<unknown>;
}) {
  const bridge = window.electronAPI?.localDsh;
  const operation = usePersonalOperation(true, `archive:${target.kind}:${target.taskId}`);
  const [collectionId, setCollectionId] = useState('');
  const [confirmation, setConfirmation] = useState<{ selection: ArchiveSelection; rebase: boolean }>();
  const writable = collections.filter(c => c.owned && c.status === 'available' && !c.externalSource);
  const collection = writable.find(c => c.id === collectionId);
  const receipt = state?.binding.archive;
  const pending = receipt?.status === 'pending';
  const pendingCollection = writable.find(c => c.id === receipt?.collectionId);
  const oversized = selected.some(n => (state?.files.find(f => f.name === n)?.size ?? 0) > 512 * 1024 * 1024);
  useEffect(() => { setConfirmation(undefined); setCollectionId(''); }, [operation.scope]);
  const confirm = async () => {
    if (!confirmation || !bridge) return;
    const captured = confirmation, { isCurrent } = operation.capture();
    setConfirmation(undefined);
    await command(async () => {
      await bridge.taskArchive(target, captured.selection, captured.rebase);
      if (isCurrent()) await refreshCollections();
    });
  };
  return <section className="task-archive-panel" aria-label="归档到资料">
    <h3>归档到资料</h3>
    <p>只上传勾选的文件，不上传整个工作文件夹。单份最多 512 MiB、每批 5 份；本地工作不受此限。归档与提交、验收分别处理。</p>
    <div className="task-material-actions">
      <Select aria-label="归档目标集合" placeholder="选择归档集合" value={collection?.id}
        disabled={busy || pending} onChange={setCollectionId}
        options={writable.map(c => ({ value: c.id, label: `${c.name} · ${researchScopeLabels[c.scope]}` }))} />
      <Button disabled={busy} onClick={() => void command(async () => { await refreshCollections(); })}>刷新集合</Button>
      <Link to="/library">到资料页管理集合</Link>
    </div>
    {collection && <p>归档后可见范围：<strong>{researchScopeLabels[collection.scope]}</strong>。按集合的现有授权执行。</p>}
    {oversized && <Alert type="info" message="选中成果超过共享大小限制，可继续在本机使用；请精简副本后归档。" />}
    <Button disabled={!bridge?.taskArchive || !state || busy || pending || !collection || !selected.length || selected.length > 5 || oversized || state.phase === 'running'}
      onClick={() => collection && setConfirmation({ rebase: false, selection: {
        requestId: crypto.randomUUID(), collectionId: collection.id, collectionName: collection.name,
        scope: collection.scope, expectedCollectionVersion: collection.version, names: [...selected],
      } })}>归档选中文件…</Button>
    {receipt && <Alert type={pending ? 'warning' : 'success'}
      message={pending ? `归档待核对 · 已收到 ${receipt.files.length}/${receipt.names.length} 份文件回执` : `已归档 ${receipt.files.length} 份文件到「${receipt.collectionName}」`}
      description={<>
        {receipt.transfer && <p>正在归档 {receipt.transfer.name} · {Math.floor(receipt.transfer.bytes / receipt.transfer.total * 100)}%（{Math.ceil(receipt.transfer.bytes/1048576)}/{Math.ceil(receipt.transfer.total/1048576)} MiB）</p>}
        {receipt.files.map(f => <p key={f.id}><Link to={`/library?collection=${encodeURIComponent(receipt.collectionId)}&file=${encodeURIComponent(f.id)}`}>{f.name}</Link> · v{f.version} · {f.extraction === 'text_extracted' ? '已提取文字' : f.extraction === 'extraction_failed' ? '原件已保存，文字提取失败' : '仅保存原件'}</p>)}
        {pending && <><p>重试使用首次归档保存的文件内容，不读取后来修改的版本。</p>
          {receipt.versionConflict && <p>集合已更新，请刷新集合并核对共享范围后继续。</p>}
          <Button disabled={busy || !pendingCollection || pendingCollection.scope !== receipt.scope}
            onClick={() => setConfirmation({ rebase: !!receipt.versionConflict, selection: {
              ...receipt, expectedCollectionVersion: receipt.versionConflict ? pendingCollection!.version : receipt.expectedCollectionVersion,
            } })}>{receipt.versionConflict ? '已核对集合，继续归档…' : '重试原归档…'}</Button>
        </>}
      </>} />}
    <Modal title="确认归档文件" open={!!confirmation} okText="确认归档" cancelText="取消" onCancel={() => setConfirmation(undefined)} onOk={() => void confirm()}>
      <p>目标集合：{confirmation?.selection.collectionName}</p>
      <p>可见范围：<strong>{confirmation && researchScopeLabels[confirmation.selection.scope]}</strong></p>
      <ul>{confirmation?.selection.names.map(name => <li key={name}>{name}</li>)}</ul>
      <p>这些文件将上传到 AcceptCat 资料服务。本地原件保留，任务状态不会因此变成已提交或已验收。</p>
    </Modal>
  </section>;
}
