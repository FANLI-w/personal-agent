// The same ordered entry point serves fresh and long-lived checkouts.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPnpm } from '../clients/openim/scripts/workspace-build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const client = path.join(root, 'clients/openim');
const mode = process.argv[2];
if (!['prepare', 'win'].includes(mode) || process.argv.length !== 3) throw Error('Usage: node scripts/desktop-build.mjs prepare|win');
if (mode === 'win' && process.platform !== 'win32') throw Error('Build the Windows native SDK/installer on Windows');
runPnpm(root, ['install', '--frozen-lockfile']);
runPnpm(root, ['run', 'build:desktop-deps']);
runPnpm(client, ['install', '--ignore-workspace', '--frozen-lockfile']);
runPnpm(client, ['run', 'check:workspace']);
if (mode === 'win') runPnpm(client, ['run', 'build:win']);
