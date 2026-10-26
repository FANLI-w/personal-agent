import type { RequestFor } from "@research-agent-platform/contracts";
import type { BuiltinMethod } from "@research-agent-platform/research-skills/builtin-methods";
import { agentRoles, legacyRoleProfiles, roleDefaults } from "@research-agent-platform/research-skills/role-catalog";
import { resolveRoleProfile, type AgentRoleProfile } from "@research-agent-platform/research-skills/roles";

// Suggestions never install, bind, enable, execute or share anything.
export function suggestedRoleMethods(profile?: AgentRoleProfile): readonly string[] {
  if (!profile) return [];
  const fallback = agentRoles.find(role => role.id === roleDefaults.specialist)!;
  const current = resolveRoleProfile(profile, fallback.profile, agentRoles, legacyRoleProfiles);
  return agentRoles.find(role =>
    (["introduction", "personality", "capabilityDescription"] as const)
      .every(key => role.profile[key] === current[key]),
  )?.methods || [];
}

export function matchingBuiltinMethods(methods: readonly BuiltinMethod[], search: string, profile?: AgentRoleProfile) {
  const recommended = new Set(suggestedRoleMethods(profile));
  const query = search.trim().toLocaleLowerCase();
  return methods.filter(method => `${method.id} ${method.displayName} ${method.package.description}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => Number(recommended.has(b.id)) - Number(recommended.has(a.id)) || a.id.localeCompare(b.id));
}

export function builtinMethodDraft(method: BuiltinMethod): RequestFor<"installSkill">["body"] {
  return {
    package: structuredClone(method.package),
    source: { kind: "copy", label: `AcceptCat 内置方法 · ${method.id}`, revision: method.digest },
  };
}
