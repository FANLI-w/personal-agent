import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentRoles } from '@research-agent-platform/research-skills/role-catalog';
import { contactRoleBundle, contactRoleProfile, readRoleImport } from '../src/research/agent-role-documents.ts';

const contact = (profile, role = 'specialist') => ({ id: 'synthetic-agent-id', displayName: profile.displayName,
  identity: { kind: 'personal_agent', ownerMemberId: 'synthetic-owner' }, profile: { ...profile, role, version: 3 },
  privateMemory: 'MUST_NOT_EXPORT', model: { apiKey: 'SYNTHETIC_MUST_NOT_EXPORT' } });
test('all canonical roles export actual persona/work documents and import as profile-only owned specialists', () => {
  for (const role of agentRoles) {
    const bundle = contactRoleBundle(contact(role.profile, role.kind));
    assert.equal(bundle.files['persona.md'], role.profile.personality);
    assert.equal(bundle.files['work.md'], role.profile.capabilityDescription);
    assert.deepEqual(readRoleImport(JSON.stringify(bundle)), { format: 'research-agent-profile/v1', profile: role.profile });
    assert.doesNotMatch(JSON.stringify(bundle), /MUST_NOT_EXPORT|synthetic-agent-id|synthetic-owner/);
  }
});
test('legacy profile import stays exact and current user edits are not replaced by templates', () => {
  const profile = { ...agentRoles[0].profile, displayName: 'My own colleague', personality: 'My edited preference' };
  const legacy = { format: 'research-agent-profile/v1', profile };
  assert.deepEqual(readRoleImport(JSON.stringify(legacy)), legacy);
  assert.deepEqual(contactRoleProfile(contact(profile)), profile);
  assert.deepEqual(readRoleImport(JSON.stringify(contactRoleBundle(contact(profile)))), legacy);
});
test('unknown formats, memory/connection additions and partial bundles cannot produce an API import', () => {
  for (const value of [{ format: 'other' }, { format: 'acceptcat-agent-role/v1' },
    { format: 'research-agent-profile/v1', profile: agentRoles[0].profile, privateMemory: 'no' }])
    assert.throws(() => readRoleImport(JSON.stringify(value)));
});
