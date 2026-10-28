import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, readdirSync, lstatSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const lock = JSON.parse(readFileSync(new URL('./runtime-lock.json', import.meta.url), 'utf8'));
async function hash(file, algorithm = 'sha256', encoding = 'hex') {
  const digest = createHash(algorithm); for await (const chunk of createReadStream(file)) digest.update(chunk); return digest.digest(encoding);
}
function files(root, prefix = '') {
  return readdirSync(path.join(root, prefix), { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name, 'en')).flatMap(entry => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw Error('DSH distribution must not contain filesystem links');
    return entry.isDirectory() ? files(root, relative) : [relative];
  });
}
async function digestTree(root) {
  const digest = createHash('sha256');
  for (const name of files(root).filter(n => n !== '.acceptcat-runtime.json')) digest.update(`${name}\0${await hash(path.join(root, name))}\n`);
  return digest.digest('hex');
}
export async function stageRuntime(clientRoot) {
  const target = path.join(clientRoot, '.dsh-runtime'), marker = path.join(target, '.acceptcat-runtime.json');
  if (existsSync(target)) {
    if (lstatSync(target).isSymbolicLink() || !existsSync(marker)) throw Error('Refusing to overwrite an unowned .dsh-runtime directory');
    await verifyRuntime(target);
    console.log(`Verified bundled DSH ${lock.version}`); return;
  }
  const cache = path.join(clientRoot, '.dsh-download'); mkdirSync(cache, { recursive: true });
  const installer = process.env.ACCEPTCAT_DSH_INSTALLER || path.join(cache, `dsh-${lock.version}.exe`);
  if (!existsSync(installer)) {
    if (process.env.ACCEPTCAT_DSH_INSTALLER) throw Error('Specified DSH installer does not exist');
    const download = spawnSync('curl.exe', ['--fail','--location','--retry','2','--max-time','600',lock.url,'--output',installer], { stdio: 'inherit', windowsHide: true });
    if (download.status !== 0) throw Error('Pinned DSH download failed');
  }
  if (lstatSync(installer).size !== lock.size || await hash(installer, 'sha512', 'base64') !== lock.sha512) throw Error('DSH installer checksum mismatch');
  const require = createRequire(path.join(clientRoot, 'package.json'));
  const seven = createRequire(require.resolve('electron-builder'))('7zip-bin').path7za;
  const staged = path.join(cache, `extracted-${Date.now()}`); mkdirSync(staged);
  const extraction = spawnSync(seven, ['x',installer,`-o${staged}`,'-y','-bso0','-bsp0'], { stdio: 'inherit', windowsHide: true });
  if (extraction.status !== 0) throw Error('Pinned DSH extraction failed');
  for (const file of ['DeepSeek Harness.exe','resources/app.asar','LICENSE.electron.txt','LICENSES.chromium.html','resources/runtime/cli/bin/dsh.cmd'])
    if (!existsSync(path.join(staged, file))) throw Error(`DSH distribution missing ${file}`);
  writeFileSync(path.join(staged, '.acceptcat-runtime.json'), JSON.stringify({ ...lock, tree: await digestTree(staged) }, null, 2));
  renameSync(staged, target); console.log(`Staged complete DSH ${lock.version} with upstream licenses and bundled dependencies`);
}
export async function verifyRuntime(target) {
  const prior = JSON.parse(readFileSync(path.join(target, '.acceptcat-runtime.json'), 'utf8'));
  if (prior.sha512 !== lock.sha512 || prior.tree !== await digestTree(target)) throw Error('Bundled DSH changed or is incomplete; move the old staging directory aside and prepare again');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await stageRuntime(path.resolve(process.argv[2] || 'clients/openim'));
