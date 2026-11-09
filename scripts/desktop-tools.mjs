// Third-party binaries the desktop build must ship. Every entry is pinned by
// version and SHA256: the build refuses a download it cannot verify, and an
// existing verified file is reused so repeat builds stay offline.
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const tools = [
  {
    name: 'tectonic',
    version: '0.17.0',
    archive: 'zip',
    url: 'https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%400.17.0/tectonic-0.17.0-x86_64-pc-windows-msvc.zip',
    sha256: 'f61ce51f0b0ade1015b7de7ef368541c5424e9756ecbd0d7af97d6d48030845f',
    // One 51.5 MB executable; the TeX bundle is fetched on demand at first compile.
    member: 'tectonic.exe',
    target: 'tools/tectonic',
  },
  {
    name: 'dsh-research-workbench',
    version: '0.4.0',
    archive: 'tgz',
    url: 'https://github.com/luoyan96/dsh-research-workbench/releases/download/v0.4.0/dsh-research-workbench-0.4.0.tgz',
    sha256: '583de48caac441a2fe97c316a09e08fa13b23af512a7b9b7435643316b594585',
    member: 'dsh-research-workbench-0.4.0.tgz',
    target: 'tools/plugins',
  },
];

async function digest(file) {
  const hash = createHash('sha256');
  hash.update(await readFile(file));
  return hash.digest('hex');
}

// GitHub Releases 走 CDN，偶发 502/503/504 与连接中断。这类错误重试即可恢复；
// 4xx（除 429）说明 URL 或权限有问题，重试没有意义，直接失败。
// 优先用 curl：它自带 HTTP/1.1 回落、断点与 --retry-all-errors，比 fetch 更能扛住 CDN 抖动。
async function download(url, file) {
  try {
    await run('curl.exe', [
      '-fsSL',
      '--http1.1',
      '--retry', '2',
      '--retry-max-time', '180',
      '--retry-delay', '5',
      '--max-time', '120',
      '-o', file,
      url,
    ]);
    return;
  } catch (curlError) {
    if (curlError?.code !== 'ENOENT') console.log(`curl 下载失败，改用 fetch：${curlError?.message ?? curlError}`);
  }
  const attempts = 4;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(120000) });
      if (!response.ok || !response.body) {
        const retryable = response.status >= 500 || response.status === 429;
        const error = Error(`下载失败 ${response.status}: ${url}`);
        Object.assign(error, { retryable });
        throw error;
      }
      await pipeline(Readable.fromWeb(response.body), createWriteStream(file));
      return;
    } catch (error) {
      const retryable = error?.retryable ?? true; // 网络中断与超时同样重试
      if (!retryable || attempt === attempts) throw error;
      await rm(file, { force: true });
      const wait = attempt * 5000;
      console.log(`下载重试 ${attempt}/${attempts - 1}（${wait}ms 后）：${error?.message ?? error}`);
      await new Promise(resolve => setTimeout(resolve, wait));
    }
  }
}

async function unpack(entry, archive, destination) {
  if (entry.archive === 'tgz') {
    await copyFile(archive, path.join(destination, entry.member));
    return;
  }
  const staging = `${destination}.unpack`;
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  // PowerShell ships with Windows, which is the only platform this build targets.
  await run('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${staging}' -Force`,
  ]);
  await copyFile(path.join(staging, entry.member), path.join(destination, entry.member));
  await rm(staging, { recursive: true, force: true });
}

/** Ensures every pinned tool is present and verified; returns the manifest path. */
export async function prepareTools(client) {
  const manifest = [];
  for (const entry of tools) {
    const destination = path.join(client, entry.target);
    const file = path.join(destination, entry.member);
    const cache = path.join(client, 'tools', '.cache', `${entry.name}-${entry.version}.${entry.archive}`);
    await mkdir(destination, { recursive: true });
    if (existsSync(file)) {
      if (entry.archive === 'tgz' && (await digest(file)) !== entry.sha256)
        throw Error(`${entry.name} 已有插件文件校验失败`);
      manifest.push({ ...entry, path: `${entry.target}/${entry.member}` });
      continue;
    }
    if (!existsSync(cache) || (await digest(cache)) !== entry.sha256) {
      await mkdir(path.dirname(cache), { recursive: true });
      console.log(`Downloading ${entry.name} ${entry.version}…`);
      await rm(cache, { force: true });
      await download(entry.url, cache);
      const actual = await digest(cache);
      if (actual !== entry.sha256)
        throw Error(`${entry.name} 校验失败：期望 ${entry.sha256}，实际 ${actual}`);
    }
    await unpack(entry, cache, destination);
    const installed = await digest(file);
    if (entry.archive === 'tgz' && installed !== entry.sha256)
      throw Error(`${entry.name} 解包后校验失败`);
    manifest.push({ ...entry, path: `${entry.target}/${entry.member}` });
  }
  const file = path.join(client, 'tools', 'manifest.json');
  await writeFile(file, JSON.stringify(manifest.map(({ name, version, sha256, path: relative }) => ({ name, version, sha256, path: relative })), null, 2));
  return file;
}
