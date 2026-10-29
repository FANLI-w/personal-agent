import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

export const originalLimit = 512 * 1024 * 1024;
export async function hashLocalFile(file: string) {
  const hash = createHash('sha256'); let size = 0;
  for await (const chunk of createReadStream(file)) { size += chunk.length; hash.update(chunk); }
  return { sha256: hash.digest('hex'), size };
}
export async function copyLocalMaterial(source: string, destination: string, limit = Number.MAX_SAFE_INTEGER) {
  const before = await stat(source), hash = createHash('sha256'); let size = 0;
  let created = false;
  const output = createWriteStream(destination, {flags:'wx',mode:0o600});
  output.on('open', () => { created = true; });
  try {
    await pipeline(createReadStream(source), new Transform({transform(chunk,_encoding,done) {
      size += chunk.length;
      if (size > limit) { done(Error('共享原件超过 512 MiB；本地工作仍可继续。')); return; }
      hash.update(chunk); done(null, chunk);
    }}), output);
    const after = await stat(source);
    if (before.size !== size || after.size !== size || before.mtimeMs !== after.mtimeMs) throw Error('文件正在变化，请保存后重试。');
    return {sha256:hash.digest('hex'),size};
  } catch(error) { if (created) await unlink(destination).catch(()=>{}); throw error; }
}
