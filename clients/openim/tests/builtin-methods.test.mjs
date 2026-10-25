import { test } from 'node:test';
import assert from 'node:assert/strict';
import { builtinMethods } from '@research-agent-platform/research-skills/builtin-methods';
import { agentRoles, legacyRoleProfiles } from '@research-agent-platform/research-skills/role-catalog';
import { builtinMethodDraft, matchingBuiltinMethods, suggestedRoleMethods } from '../src/research/builtin-methods.ts';
import { SkillPackage } from '@research-agent-platform/contracts';

test('new and unchanged legacy roles suggest methods, while authored roles stay independent', () => {
  const role = agentRoles.find(role => role.id === 'grant-proposal');
  assert.deepEqual(suggestedRoleMethods(role.profile), ['research-grant-development']);
  const legacy = legacyRoleProfiles.find(role => role.id === 'literature-reading');
  assert.deepEqual(suggestedRoleMethods(legacy.profile), agentRoles.find(role => role.id === legacy.id).methods);
  assert.deepEqual(suggestedRoleMethods({ ...role.profile, personality: 'My own authored decisions' }), []);
});

test('search finds the supplied Chinese specialties and prioritizes a suitable method without hiding alternatives', () => {
  const role = agentRoles.find(role => role.id === 'grant-proposal');
  const matches = matchingBuiltinMethods(builtinMethods, '', role.profile);
  assert.equal(matches[0].id, 'research-grant-development');
  assert.equal(matches.length, builtinMethods.length);
  for (const query of ['选题', 'PPT', '专利', '软著']) assert.ok(matchingBuiltinMethods(builtinMethods, query).length, query);
});

test('preparing a private copy preserves every instruction/reference but contains no binding, enablement or external action', () => {
  const method = builtinMethods.find(method => method.id === 'software-copyright-preparation');
  const draft = builtinMethodDraft(method);
  assert.deepEqual(Object.keys(draft).sort(), ['package', 'source']);
  assert.deepEqual(draft.package, method.package);
  assert.equal(SkillPackage.safeParse(draft.package).success, true);
  assert.equal(draft.source.revision, method.digest);
  draft.package.references[0].text = 'Only the draft is changed';
  assert.notEqual(draft.package.references[0].text, method.package.references[0].text);
});
