import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../src/research/contact-removal.ts', import.meta.url), 'utf8');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { module, exports: module.exports, require: name => { throw Error('Unexpected runtime import ' + name); } });
const { contactRemoval, executeContactRemoval } = module.exports;
const agent = { id: 'agent-A', displayName: '合成助手', identity: { kind: 'personal_agent', ownerMemberId: 'owner-A' },
  profile: { role: 'specialist', version: 7 }, relationship: { status: 'own', version: 0 }, allowedActions: ['chat', 'edit_profile'] };

test('uses profile version for own specialists and relationship version for peers; excludes system/self/deleted Agents', () => {
  assert.equal(contactRemoval(agent, 'owner-A').expectedVersion, 7);
  assert.equal(contactRemoval(agent, 'owner-B'), null);
  assert.equal(contactRemoval({ ...agent, profile: { ...agent.profile, role: 'coordinator' } }, 'owner-A'), null);
  assert.equal(contactRemoval({ ...agent, allowedActions: [] }, 'owner-A'), null);
  const peer = { ...agent, identity: { kind: 'human', memberId: 'member-B' }, allowedActions: ['chat', 'remove'], relationship: { status: 'accepted', version: 4 } };
  const action = contactRemoval(peer, 'owner-A');
  assert.equal(action.kind, 'relationship'); assert.equal(action.expectedVersion, 4);
  assert.equal(contactRemoval({ ...peer, identity: { kind: 'human', memberId: 'owner-A' }, allowedActions: ['edit_profile'] }, 'owner-A'), null);
});
test('sends the reviewed target/version to the correct route with one stable confirmation key', async () => {
  const action = contactRemoval(agent, 'owner-A'), calls = [];
  const scope = { isCurrent: () => true, request: async (...args) => { calls.push(args); }, refresh: async () => { calls.push('refresh'); } };
  await executeContactRemoval(action, 'stable-confirmation-key', scope);
  assert.equal(calls[0][0], 'deletePersonalAgent');
  assert.equal(calls[0][1].params.id, 'agent-A'); assert.equal(calls[0][1].body.expectedVersion, 7);
  assert.equal(calls[0][1].idempotencyKey, 'stable-confirmation-key'); assert.equal(calls[1], 'refresh');
  calls.length = 0;
  await executeContactRemoval({ ...action, kind: 'relationship', expectedVersion: 3 }, 'peer-key', scope);
  assert.equal(calls[0][0], 'revokeContact'); assert.equal(calls[0][1].body.expectedVersion, 3);
});
test('does not send after leaving the reviewed account or panel', async () => {
  let calls = 0;
  await assert.rejects(executeContactRemoval(contactRemoval(agent, 'owner-A'), 'key', {
    isCurrent: () => false, request: async () => { calls++; }, refresh: async () => { calls++; },
  }), /已切换/);
  assert.equal(calls, 0);
});
test('a late successful response does not refresh another account', async () => {
  let current = true, release, refreshed = 0;
  const pending = executeContactRemoval(contactRemoval(agent, 'owner-A'), 'key', {
    isCurrent: () => current, request: () => new Promise(resolve => { release = resolve; }), refresh: async () => { refreshed++; },
  });
  current = false; release(); const result = await pending;
  assert.equal(result.current, false); assert.equal(refreshed, 0);
});
test('a rejected deletion keeps the list untouched and retries the same reviewed request', async () => {
  const action = contactRemoval(agent, 'owner-A'), calls = []; let refresh = 0;
  const scope = { isCurrent: () => true, refresh: async () => { refresh++; }, request: async (name, options) => { calls.push(options); throw Error('VERSION_CONFLICT'); } };
  await assert.rejects(executeContactRemoval(action, 'key', scope), /VERSION_CONFLICT/);
  await assert.rejects(executeContactRemoval(action, 'key', scope), /VERSION_CONFLICT/);
  assert.equal(refresh, 0); assert.equal(calls[0].idempotencyKey, calls[1].idempotencyKey);
  assert.equal(calls[0].params.id, calls[1].params.id); assert.equal(calls[0].body.expectedVersion, calls[1].body.expectedVersion);
});
test('a failed list refresh reports confirmed deletion separately without sending another mutation', async () => {
  let calls = 0;
  const result = await executeContactRemoval(contactRemoval(agent, 'owner-A'), 'key', {
    isCurrent: () => true, request: async () => { calls++; }, refresh: async () => { throw Error('offline'); },
  });
  assert.equal(result.current, true); assert.equal(result.refreshed, false); assert.equal(calls, 1);
});
