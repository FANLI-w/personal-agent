import { cp, mkdir, readdir, rm, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve, relative, isAbsolute } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const source = resolve(root, 'agents/skills')
const target = resolve(root, 'packages/research-skills/dist/skills')
const builtRoot = resolve(root, 'packages/research-skills/dist')
const child = relative(builtRoot, target)
if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Invalid generated skills path')
// This exact generated directory is replaced so removed skills cannot remain in a build.
await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })
await cp(source, target, { recursive: true })
// Public, text-only methods are loaded lazily by the desktop picker. The same
// parser and normal install API still validate every owner-confirmed copy.
const { parseImportedSkill } = await import('../packages/research-skills/dist/import.js')
async function collect(directory, prefix = '') {
  const files = []
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(directory, entry.name), name = prefix + entry.name
    if (entry.isDirectory()) files.push(...await collect(path, name + '/'))
    else if (entry.isFile() && /\.(md|ya?ml|json|txt|csv|bib)$/i.test(entry.name)) files.push({ path: name, text: (await readFile(path, 'utf8')).replace(/\r\n/g, '\n') })
    else throw Error(`Canonical method contains unsupported file: ${name}`)
  }
  return files
}
const methods = []
for (const entry of (await readdir(source, { withFileTypes: true })).filter(item => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  const files = await collect(resolve(source, entry.name))
  const method = parseImportedSkill(files, 0, 0)
  const displayName = /^displayName:\s*(.+?)\s*$/m.exec(files.find(file => file.path === 'SKILL.md').text)?.[1] || method.name
  methods.push({ id: entry.name, displayName, digest: createHash('sha256').update(JSON.stringify(files)).digest('hex'), package: method })
}
await writeFile(resolve(builtRoot, 'builtin-methods.js'), `// Generated from agents/skills. Public text only.\nexport const builtinMethods = ${JSON.stringify(methods)};\n`)
await writeFile(resolve(builtRoot, 'builtin-methods.d.ts'), "import type { ImportedSkill } from './import.js';\nexport interface BuiltinMethod { id: string; displayName: string; digest: string; package: ImportedSkill }\nexport declare const builtinMethods: readonly BuiltinMethod[];\n")
console.log(`Packaged ${(await readdir(source)).length} skills from agents/skills.`)
