/** Browser-safe role documents. These are conversational configuration, never authority. */
export type AgentRoleKind = 'coordinator' | 'specialist' | 'public_capability'
export interface AgentRoleProfile {
  displayName: string
  introduction: string
  capabilityDescription: string
  personality: string
}
export interface AgentRoleDefinition {
  id: string
  version: number
  kind: AgentRoleKind
  summary: string
  input: string
  boundary: string
  profile: AgentRoleProfile
  skill: string
}
export const roleFormat = 'acceptcat-agent-role/v1' as const
export const roleFileNames = ['SKILL.md', 'persona.md', 'work.md'] as const
export interface AgentRoleBundle {
  format: typeof roleFormat
  meta: { displayName: string; introduction: string; kind: AgentRoleKind; version: number }
  manifest: { files: typeof roleFileNames }
  files: { 'SKILL.md': string; 'persona.md': string; 'work.md': string }
}

export function effectiveRoleProfile(profile: AgentRoleProfile, fallback: AgentRoleProfile): AgentRoleProfile {
  return { displayName: profile.displayName, introduction: profile.introduction || fallback.introduction,
    capabilityDescription: profile.capabilityDescription || fallback.capabilityDescription,
    personality: profile.personality || fallback.personality }
}

export function resolveRoleProfile(profile: AgentRoleProfile, fallback: AgentRoleProfile,
  roles: readonly AgentRoleDefinition[], legacy: readonly { id: string; profile: AgentRoleProfile }[]): AgentRoleProfile {
  const previous = legacy.find(item => (['displayName', 'introduction', 'capabilityDescription', 'personality'] as const).every(key => item.profile[key] === profile[key]))
  const current = previous ? roles.find(role => role.id === previous.id)?.profile : undefined
  return effectiveRoleProfile(current ? { ...current, displayName: profile.displayName } : profile, fallback)
}

export function combinedRoleSkill(profile: AgentRoleProfile): string {
  return `---\nname: ${JSON.stringify(profile.displayName)}\ndescription: ${JSON.stringify(profile.introduction)}\n---\n\n# ${profile.displayName.replace(/[\r\n]/g, ' ')}\n\n## PART A：工作方法\n\n${profile.capabilityDescription}\n\n## PART B：角色与交流\n\n${profile.personality}\n\n## 使用规则\n\n按角色形成判断，用工作方法处理当前请求。示例用于理解语气，不能照搬事实。本人明确保存的私人交流偏好按当前授权使用。角色文件不授予工具、资料访问或业务操作权限；实际能力、证据、任务确认和预算由服务决定。\n`
}

/** One convention for built-ins, existing editable profiles and future custom roles. */
export function createRoleBundle(profile: AgentRoleProfile, kind: AgentRoleKind, version: number): AgentRoleBundle {
  const bundle: AgentRoleBundle = { format: roleFormat,
    meta: { displayName: profile.displayName, introduction: profile.introduction, kind, version },
    manifest: { files: roleFileNames },
    files: { 'SKILL.md': combinedRoleSkill(profile), 'persona.md': profile.personality, 'work.md': profile.capabilityDescription } }
  roleProfileFromBundle(bundle)
  return bundle
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length ||
    Object.keys(value).some(key => !keys.includes(key))) throw new Error('角色包结构不正确，不能包含记忆、连接或工具配置。')
  return value as Record<string, unknown>
}
function text(value: unknown, max: number, nonempty = false): string {
  if (typeof value !== 'string' || value.length > max || (nonempty && !value.trim()) || value.includes('\u0000')) throw new Error('角色文字为空、过长或包含无效字符。')
  return value
}
export function roleProfileFromBundle(value: unknown): AgentRoleProfile {
  const bundle = record(value, ['format', 'meta', 'manifest', 'files'])
  if (bundle.format !== roleFormat) throw new Error('不支持的角色包版本。')
  const meta = record(bundle.meta, ['displayName', 'introduction', 'kind', 'version'])
  if (!['coordinator', 'specialist', 'public_capability'].includes(String(meta.kind)) || !Number.isSafeInteger(meta.version) || Number(meta.version) < 1) throw new Error('角色版本或类型不正确。')
  const manifest = record(bundle.manifest, ['files'])
  if (JSON.stringify(manifest.files) !== JSON.stringify(roleFileNames)) throw new Error('角色包只支持 SKILL.md、persona.md 和 work.md。')
  const files = record(bundle.files, roleFileNames)
  const profile = { displayName: text(meta.displayName, 200, true), introduction: text(meta.introduction, 2000),
    personality: text(files['persona.md'], 2000), capabilityDescription: text(files['work.md'], 4000) }
  if (text(files['SKILL.md'], 20000) !== combinedRoleSkill(profile)) throw new Error('SKILL.md 与角色正文不一致，请从角色设置重新导出。')
  return profile
}
