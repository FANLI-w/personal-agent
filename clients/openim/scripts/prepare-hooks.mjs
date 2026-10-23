// This client is normally a directory inside the platform repository. Upstream
// Husky's standalone install assumes .git is in cwd and fails in a fresh clone.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const client = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.env.HUSKY === '0' || process.env.CI || !existsSync(path.join(client, '.git'))) {
  console.log('Skip standalone Husky setup: client is embedded in a monorepo or this is a CI build.');
} else {
  process.chdir(client);
  createRequire(path.join(client, 'package.json'))('husky').install();
}
