import type { Contact } from '@research-agent-platform/contracts';
import { AgentProfileDocument } from '@research-agent-platform/contracts';
import { agentRoles, roleDefaults, legacyRoleProfiles } from '@research-agent-platform/research-skills/role-catalog';
import { createRoleBundle, resolveRoleProfile, roleProfileFromBundle, roleFormat } from '@research-agent-platform/research-skills/roles';

export function contactRoleProfile(contact: Contact) {
  const kind = contact.profile.role === 'human' ? 'specialist' : contact.profile.role;
  const fallback = agentRoles.find(role => role.id === roleDefaults[kind])!;
  return resolveRoleProfile({ displayName: contact.displayName, introduction: contact.profile.introduction,
    capabilityDescription: contact.profile.capabilityDescription, personality: contact.profile.personality }, fallback.profile, agentRoles, legacyRoleProfiles);
}
export function contactRoleBundle(contact: Contact) {
  if (contact.identity.kind === 'human') throw new Error('真人联系人没有 Agent 角色包。');
  return createRoleBundle(contactRoleProfile(contact), contact.profile.role === 'human' ? 'specialist' : contact.profile.role, contact.profile.version);
}
/** Portable public text only. The existing API alone decides identity/authority. */
export function readRoleImport(json: string) {
  if (json.length > 50000) throw new Error('角色资料过长。');
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { throw new Error('JSON 格式不正确，请检查引号和逗号。'); }
  const profile = raw && typeof raw === 'object' && 'format' in raw && raw.format === roleFormat
    ? { format: 'research-agent-profile/v1' as const, profile: roleProfileFromBundle(raw) } : raw;
  const parsed = AgentProfileDocument.safeParse(profile);
  if (!parsed.success) throw new Error('请选择 AcceptCat 角色包或原版人设 JSON；只导入公开角色文字。');
  return parsed.data;
}
export function saveRoleText(name: string, content: string, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
