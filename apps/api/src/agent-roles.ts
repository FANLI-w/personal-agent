import { agentRoles, roleDefaults, roleCatalogDigest, legacyRoleProfiles } from '@research-agent-platform/research-skills/role-catalog'
import { resolveRoleProfile, type AgentRoleKind } from '@research-agent-platform/research-skills/roles'
import type { Contact } from '@research-agent-platform/contracts'

export { roleCatalogDigest }
export function canonicalAgentRole(id: string) {
  const role = agentRoles.find(item => item.id === id)
  if (!role) throw new Error('Missing packaged agent role')
  return role
}
export function defaultAgentRole(kind: AgentRoleKind) {
  return canonicalAgentRole(roleDefaults[kind])
}
// Preserve every authored field; empty legacy/default profiles use the same
// packaged role documents as the editor. No database rewrite or new authority.
export function modelAgentProfile(agent: Contact) {
  const kind = agent.profile.role === 'human' ? 'specialist' : agent.profile.role
  const { displayName: _name, ...profile } = resolveRoleProfile({ displayName: agent.displayName, ...agent.profile }, defaultAgentRole(kind).profile, agentRoles, legacyRoleProfiles)
  return { ...agent.profile, ...profile, introduction: agent.profile.introduction }
}
