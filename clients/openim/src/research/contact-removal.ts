import type { Contact } from '@research-agent-platform/contracts';

export type ContactRemoval = {
  kind: 'agent' | 'relationship'; id: string; displayName: string;
  expectedVersion: number; label: string;
};
export function contactRemoval(contact: Contact | undefined, actorId?: string): ContactRemoval | null {
  if (!contact || !actorId) return null;
  if (contact.identity.kind === 'personal_agent' && contact.identity.ownerMemberId === actorId &&
      contact.profile.role === 'specialist' && contact.allowedActions.includes('edit_profile')) {
    return { kind: 'agent', id: contact.id, displayName: contact.displayName, expectedVersion: contact.profile.version, label: '删除 Agent' };
  }
  if (contact.allowedActions.includes('remove')) {
    return { kind: 'relationship', id: contact.id, displayName: contact.displayName, expectedVersion: contact.relationship.version, label: '删除联系人' };
  }
  return null;
}
export type RemovalRequest = (name: 'deletePersonalAgent' | 'revokeContact', options: {
  params: { id: string }; body: { expectedVersion: number }; idempotencyKey: string;
}) => Promise<unknown>;
/** Keep the reviewed target/version/key. A late response must not refresh another login. */
export async function executeContactRemoval(action: ContactRemoval, key: string, scope: {
  isCurrent: () => boolean; request: RemovalRequest; refresh: () => Promise<void>;
}) {
  if (!scope.isCurrent()) throw new Error('账号或页面已切换，请取消后重新操作。');
  await scope.request(action.kind === 'agent' ? 'deletePersonalAgent' : 'revokeContact', {
    params: { id: action.id }, body: { expectedVersion: action.expectedVersion }, idempotencyKey: key,
  });
  if (!scope.isCurrent()) return { current: false, refreshed: false };
  try { await scope.refresh(); }
  catch { return { current: scope.isCurrent(), refreshed: false }; }
  return { current: scope.isCurrent(), refreshed: true };
}
