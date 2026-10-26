import { Alert, Button, Tabs } from 'antd';
import type { Contact } from '@research-agent-platform/contracts';
import { contactRoleBundle, saveRoleText } from './agent-role-documents';

export function AgentRoleDocuments({ contact }: { contact: Contact }) {
  let bundle: ReturnType<typeof contactRoleBundle>;
  try { bundle = contactRoleBundle(contact); }
  catch (error) { return <Alert type="warning" message="角色文件暂时无法生成" description={error instanceof Error ? error.message : '请重新读取角色档案。'} />; }
  return <div className="rounded-lg border border-slate-200 p-3">
    <strong>这位助手的角色文件</strong>
    {contact.agentRuntime && <p className="mt-1 text-xs leading-5 text-slate-500">这是本站角色档案；外部服务的实际角色和说话方式由远端维护，本站不会把这里的角色或私人记忆自动发送过去。</p>}
    <p className="mt-1 text-xs leading-5 text-slate-500">性格与交流放在 persona.md，职责和方法放在 work.md。修改请用「编辑角色」；只想调整与你的相处方式，可用私人记忆。</p>
    <Tabs size="small" items={(['persona.md', 'work.md', 'SKILL.md'] as const).map(name => ({ key: name, label: name,
      children: <div><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-6">{bundle.files[name]}</pre>
        <Button size="small" onClick={() => saveRoleText(name, bundle.files[name])}>保存 {name}</Button></div> }))} />
    <Button onClick={() => saveRoleText('acceptcat-agent-role.json', JSON.stringify(bundle, null, 2), 'application/json')}>导出完整角色包</Button>
    <p className="mt-2 text-xs text-slate-500">只导出角色文字，不包含聊天、私人记忆、账号、模型密钥或外部连接。导入后是导入者自己的助手。</p>
  </div>;
}
