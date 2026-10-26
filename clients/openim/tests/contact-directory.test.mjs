import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source = await readFile(new URL('../src/research/contact-directory.ts', import.meta.url), 'utf8');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module, exports: module.exports, require: name => { throw Error(name); } });
const { contactDirectoryKind, readDirectoryPage, readCombinedDirectoryPage, canManageDirectoryAgent, starStorageKey, readContactStars, writeContactStar, sortDirectoryContacts } = module.exports;
const human = { id: 'human', displayName: '陈同事', identity: { kind: 'human' } };
const agent = { id: 'agent', displayName: '研究方案助手', identity: { kind: 'personal_agent' } };
const page = (data, nextCursor = null) => ({ data, nextCursor });
const memory = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), data }; };

test('separates humans, owned Agents and public/external Agents by authoritative identity', () => {
  assert.equal(contactDirectoryKind(human), 'people');
  assert.equal(contactDirectoryKind(agent), 'agents');
  assert.equal(contactDirectoryKind({ ...agent, identity: { kind: 'public_agent' }, agentRuntime: { kind: 'external' } }), 'agents');
});
test('skips multiple mixed pages with no requested identity and retains the final continuation', async () => {
  const seen = [], pages = [page([human], 'two'), page([human], 'three'), page([agent, human], 'four')];
  const result = await readDirectoryPage(async cursor => { seen.push(cursor); return pages.shift(); }, 'agents', new AbortController().signal);
  assert.deepEqual(seen, [undefined, 'two', 'three']);
  assert.equal(result.data.length, 1); assert.equal(result.data[0].id, agent.id); assert.equal(result.nextCursor, 'four');
});
test('returns a real empty terminal page and starts from the supplied cursor', async () => {
  const seen = [];
  const result = await readDirectoryPage(async cursor => { seen.push(cursor); return page([agent]); }, 'people', new AbortController().signal, 'saved');
  assert.deepEqual(seen, ['saved']); assert.equal(result.data.length, 0); assert.equal(result.nextCursor, null);
});
test('rejects a late response after cancellation before publishing a page or following its cursor', async () => {
  const controller = new AbortController(); let calls = 0, release;
  const result = readDirectoryPage(() => { calls++; return new Promise(resolve => { release = resolve; }); }, 'agents', controller.signal);
  controller.abort(); release(page([agent], 'late'));
  await assert.rejects(result, { name: 'AbortError' }); assert.equal(calls, 1);
});
test('rejects cursor cycles and service failures instead of reporting a false empty list', async () => {
  let calls = 0;
  await assert.rejects(readDirectoryPage(async () => { calls++; return page([human], 'same'); }, 'agents', new AbortController().signal), /分页/);
  assert.equal(calls, 2);
  const failure = new Error('service unavailable');
  await assert.rejects(readDirectoryPage(async () => { throw failure; }, 'people', new AbortController().signal), error => error === failure);
});
test('stars stay isolated between accounts/services and successive updates preserve other stars', () => {
  const storage = memory(), key = starStorageKey('https://one.example', 'actor-A');
  writeContactStar(storage, key, 'first', true); writeContactStar(storage, key, 'second', true); writeContactStar(storage, key, 'first', false);
  assert.equal(JSON.stringify(readContactStars(storage, key)), '["second"]');
  assert.equal(readContactStars(storage, starStorageKey('https://one.example', 'actor-B')).length, 0);
  assert.equal(readContactStars(storage, starStorageKey('https://two.example', 'actor-A')).length, 0);
  assert.throws(() => starStorageKey('', 'actor-A'));
});
test('refuses malformed star records and storage failures without replacing old data', () => {
  const storage = memory(); storage.setItem('broken', '[123]');
  assert.throws(() => writeContactStar(storage, 'broken', 'new', true)); assert.equal(storage.getItem('broken'), '[123]');
  assert.throws(() => writeContactStar({ getItem: () => '["original"]', setItem: () => { throw Error('quota'); } }, 'key', 'new', true), /quota/);
});
test('puts visible starred contacts first without changing the server list or chat preferences', () => {
  const contacts = [human, agent], original = JSON.stringify(contacts);
  const result = sortDirectoryContacts(contacts, [agent.id]);
  assert.equal(result[0].id, agent.id); assert.equal(JSON.stringify(contacts), original);
  assert.equal('pinned' in result[0], false);
});

test('unifies owned, cross-space accepted and laboratory identities without duplicates', async () => {
  const own = { ...agent, relationship: { status: 'own' } };
  const accepted = { ...agent, id: 'accepted-other-space', relationship: { status: 'accepted' } };
  const lab = { ...agent, id: 'lab-agent', relationship: { status: 'none' } };
  const seen = [];
  const result = await readCombinedDirectoryPage(async (view, cursor) => {
    seen.push([view, cursor]);
    return view === 'mine' ? page([own, accepted]) : page([own, lab, accepted]);
  }, 'agents', new AbortController().signal);
  assert.deepEqual(seen.map(([view]) => view).sort(), ['directory', 'mine']);
  assert.equal(JSON.stringify(result.data.map(c => c.id).sort()), JSON.stringify(['agent', 'accepted-other-space', 'lab-agent'].sort()));
  assert.equal(result.nextCursor, null);
  assert.equal(lab.relationship.status, 'none');
});

test('combined paging skips duplicate-only lab pages and never restarts an exhausted source', async () => {
  const own = { ...human, relationship: { status: 'own' } };
  const accepted = { ...human, id: 'friend', relationship: { status: 'accepted' } };
  const lab = { ...human, id: 'lab-human', relationship: { status: 'none' } };
  const later = { ...human, id: 'later-friend', relationship: { status: 'accepted' } };
  const seen = [];
  const read = async (view, cursor) => {
    seen.push([view, cursor]);
    if (view === 'mine') return cursor ? page([later]) : page([own, accepted], 'mine-next');
    return cursor ? page([lab]) : page([accepted, own], 'lab-next');
  };
  const first = await readCombinedDirectoryPage(read, 'people', new AbortController().signal);
  assert.equal(first.data.length, 3);
  assert.equal(first.nextCursor.mine, 'mine-next');
  assert.equal(first.nextCursor.directory, null);
  const second = await readCombinedDirectoryPage(read, 'people', new AbortController().signal, first.nextCursor);
  assert.equal(JSON.stringify(second.data.map(c => c.id)), '["later-friend"]');
  assert.equal(second.nextCursor, null);
  assert.equal(seen.filter(([view]) => view === 'directory').length, 2);
});

test('combined directory keeps identity filtering for each independently paginated source', async () => {
  const person = { ...human, relationship: { status: 'none' } };
  const bot = { ...agent, relationship: { status: 'own' } };
  const calls = [];
  const result = await readCombinedDirectoryPage(async (view, cursor) => {
    calls.push([view, cursor]);
    if (view === 'directory') return page([person]);
    return cursor ? page([bot]) : page([person], 'only-people');
  }, 'agents', new AbortController().signal);
  assert.equal(JSON.stringify(result.data.map(c => c.id)), '["agent"]');
  assert.ok(calls.some(([view, cursor]) => view === 'mine' && cursor === 'only-people'));
  assert.equal(result.nextCursor, null);
});

test('one failed scope or a late aborted combined read cannot publish a partial directory', async () => {
  const failure = new Error('synthetic lab query failure');
  await assert.rejects(readCombinedDirectoryPage(async view => {
    if (view === 'directory') throw failure;
    return page([{ ...agent, relationship: { status: 'own' } }]);
  }, 'agents', new AbortController().signal), error => error === failure);
  const controller = new AbortController(); let release;
  const reading = readCombinedDirectoryPage(view => view === 'mine'
    ? new Promise(resolve => { release = resolve; }) : Promise.resolve(page([])), 'agents', controller.signal);
  controller.abort(); release(page([]));
  await assert.rejects(reading, { name: 'AbortError' });
});

test('private skill and material controls remain restricted to editable owned local Agents', () => {
  const owned = { ...agent, identity: { kind: 'personal_agent', ownerMemberId: 'owner-A' }, allowedActions: ['edit_profile'] };
  assert.equal(canManageDirectoryAgent(owned, 'owner-A'), true);
  assert.equal(canManageDirectoryAgent(owned, 'owner-B'), false);
  assert.equal(canManageDirectoryAgent({ ...owned, allowedActions: [] }, 'owner-A'), false);
  assert.equal(canManageDirectoryAgent({ ...owned, agentRuntime: { kind: 'external' } }, 'owner-A'), false);
  assert.equal(canManageDirectoryAgent({ ...owned, identity: { kind: 'public_agent', ownerMemberId: 'owner-A' } }, 'owner-A'), false);
  assert.equal(canManageDirectoryAgent({ ...owned, identity: { kind: 'human', memberId: 'owner-A' } }, 'owner-A'), false);
});
