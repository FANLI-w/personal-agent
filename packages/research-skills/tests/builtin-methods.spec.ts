import { readFile, readdir } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { builtinMethods } from '../dist/builtin-methods.js'
import { agentRoles } from '../dist/role-catalog.js'
import { parseImportedSkill } from '../dist/import.js'

describe('curated methods available for private installation', () => {
  it('keeps the entire root and reference text importable without installing scripts or granting permissions', async () => {
    const directories = (await readdir(new URL('../../../agents/skills/', import.meta.url), { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name).sort()
    expect(builtinMethods.map(method => method.id)).toEqual(directories)
    for (const method of builtinMethods) {
      const root = (await readFile(new URL(`../../../agents/skills/${method.id}/SKILL.md`, import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
      const reconstructed = parseImportedSkill([{ path: 'SKILL.md', text: root }, ...method.package.references], 0, 0)
      expect(reconstructed).toEqual(method.package)
      expect(method.package.scriptCount).toBe(0)
      expect(method.package.assetCount).toBe(0)
      expect(method.digest).toMatch(/^[a-f0-9]{64}$/)
      expect(method.displayName.trim()).not.toBe('')
      expect(Object.keys(method).sort()).toEqual(['digest', 'displayName', 'id', 'package'])
    }
    for (const role of agentRoles) for (const method of role.methods) expect(builtinMethods.some(value => value.id === method)).toBe(true)
  })
})
