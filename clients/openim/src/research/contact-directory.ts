import type { Contact, ResponseFor } from '@research-agent-platform/contracts';

export type DirectoryKind = 'agents' | 'people';
export const contactDirectoryKind = (contact: Contact): DirectoryKind => contact.identity.kind === 'human' ? 'people' : 'agents';
type Page = ResponseFor<'chatContacts'>;
export type DirectoryQuery = { view: 'mine' | 'directory'; kind: DirectoryKind; search: string; cursor?: string };

/** Skip mixed pages with no requested identity; search remains server-side across every page. */
export async function readDirectoryPage(read: (cursor: string | undefined) => Promise<Page>, kind: DirectoryKind, signal: AbortSignal, cursor?: string): Promise<Page> {
  const seen = new Set<string>();
  for (;;) {
    signal.throwIfAborted();
    const page = await read(cursor);
    signal.throwIfAborted();
    const data = page.data.filter(contact => contactDirectoryKind(contact) === kind);
    if (data.length || !page.nextCursor) return { ...page, data };
    if (seen.has(page.nextCursor) || page.nextCursor === cursor) throw new Error('通讯录分页暂时无法继续，请刷新重试。');
    seen.add(page.nextCursor); cursor = page.nextCursor;
  }
}

export function starStorageKey(service: string, actorId: string) {
  if (!service || !actorId) throw new Error('请先连接服务并登录。');
  return `acceptcat:contact-stars:v1:${encodeURIComponent(service)}:${encodeURIComponent(actorId)}`;
}
export function readContactStars(storage: Pick<Storage, 'getItem'>, key: string): string[] {
  const value: unknown = JSON.parse(storage.getItem(key) || '[]');
  if (!Array.isArray(value) || value.length > 10000 || value.some(id => typeof id !== 'string' || !id || id.length > 200)) throw new Error('本机星标记录无法读取。');
  return [...new Set(value as string[])];
}
export function writeContactStar(storage: Pick<Storage, 'getItem' | 'setItem'>, key: string, id: string, starred: boolean) {
  const saved = readContactStars(storage, key), next = starred ? [...new Set([...saved, id])] : saved.filter(item => item !== id);
  if (next.length > 10000) throw new Error('本机星标数量已达上限。');
  storage.setItem(key, JSON.stringify(next));
  return next;
}
export function sortDirectoryContacts(contacts: Contact[], starred: string[]) {
  const stars = new Set(starred);
  return [...contacts].sort((a, b) => Number(stars.has(b.id)) - Number(stars.has(a.id)) || a.displayName.localeCompare(b.displayName, 'zh-CN') || a.id.localeCompare(b.id));
}
