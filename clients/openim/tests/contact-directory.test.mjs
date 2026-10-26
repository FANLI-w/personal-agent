import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source = await readFile(new URL('../src/research/contact-directory.ts', import.meta.url), 'utf8');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module, exports: module.exports, require: name => { throw Error(name); } });
const { contactDirectoryKind, readDirectoryPage, starStorageKey, readContactStars, writeContactStar, sortDirectoryContacts } = module.exports;
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
