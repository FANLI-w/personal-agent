import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source = await readFile(new URL('../src/research/group-members.ts', import.meta.url), 'utf8');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module, exports: module.exports });
const { readGroupCandidates, selectableGroupContacts, canonicalGroupMembers, groupIdentityLabel } = module.exports;
const human = (id, name = id) => ({ id, displayName: name, identity: { kind: 'human', memberId: id }, allowedActions: ['chat'] });
const agent = (id, owner) => ({ id, displayName: '同名助手', identity: { kind: 'personal_agent', ownerMemberId: owner }, allowedActions: ['chat'] });
const me = human('me', '测试老师'), peer = human('peer', '测试同事');

test('reads later pages and both directory scopes without relying on truncated IM contacts', async () => {
  const calls = [];
  const result = await readGroupCandidates(async (view, cursor) => {
    calls.push([view, cursor]);
    return view === 'mine' ? (cursor ? { data: [peer], nextCursor: null } : { data: [me], nextCursor: 'next' }) : { data: [me, agent('a', 'me')], nextCursor: null };
  }, new AbortController().signal);
  assert.equal(result.length, 3); assert.equal(result.some(c => c.id === 'peer'), true);
  assert.equal(calls.some(([view, cursor]) => view === 'mine' && cursor === 'next'), true);
});
test('rejects cursor cycles and cancelled late pages', async () => {
  await assert.rejects(readGroupCandidates(async () => ({ data: [peer], nextCursor: 'loop' }), new AbortController().signal), /完整读取/);
  const controller = new AbortController();
  await assert.rejects(readGroupCandidates(async () => { controller.abort(); return { data: [peer], nextCursor: null }; }, controller.signal), { name: 'AbortError' });
});
test('selection excludes self and unauthorized identities, distinguishes same-name Agent owners', () => {
  const mine = agent('mine', 'me'), other = agent('other', 'peer');
  const all = [me, peer, mine, other, { ...human('blocked'), allowedActions: [] }];
  assert.equal(JSON.stringify(selectableGroupContacts(all, 'me').map(c => c.id)), '["peer","mine","other"]');
  assert.equal(groupIdentityLabel(mine, all, 'me'), '我的智能体');
  assert.equal(groupIdentityLabel(other, all, 'me'), '测试同事的智能体');
});
test('shows canonical human owner and pending colleague, never imports technical SDK owner', () => {
  const conversation = { ownerMemberId: 'me', members: [
    { contactId: 'me', role: 'owner', status: 'joined' },
    { contactId: 'peer', role: 'member', status: 'invited' },
    { contactId: 'removed', role: 'member', status: 'revoked' },
  ] };
  const rows = canonicalGroupMembers(conversation, [me, peer, human('imAdmin')]);
  assert.equal(rows.length, 2); assert.equal(rows[0].isOwner, true); assert.equal(rows[1].status, 'invited');
  assert.equal(rows.some(m => m.contactId === 'imAdmin'), false);
  conversation.members[1].status = 'joined';
  assert.equal(canonicalGroupMembers(conversation, [me, peer]).filter(m => m.status === 'joined').length, 2);
});
test('missing or conflicting profiles never fabricate an owner identity', () => {
  const group = { ownerMemberId: 'me', members: [{ contactId: 'x', role: 'owner', status: 'joined' }] };
  assert.equal(canonicalGroupMembers(group, [])[0].contact, undefined);
  assert.equal(Boolean(canonicalGroupMembers(group, [human('x')])[0].isOwner), false);
  assert.equal(Boolean(canonicalGroupMembers(group, [agent('x', 'me')])[0].isOwner), false);
});
