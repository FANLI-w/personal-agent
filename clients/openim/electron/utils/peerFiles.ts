import { promises as fs, constants, type Stats } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { excludedLocalName } from "./localFolder";
import type { PeerFile } from "@research-agent-platform/contracts";
import type { PeerFolder, PeerReceived } from "../../src/types/peerLibrary";

export const peerFileLimit = 10485760;
const extensions = new Set([
  ".pdf",
  ".docx",
  ".txt",
  ".md",
  ".csv",
  ".xlsx",
  ".pptx",
  ".png",
  ".jpg",
  ".jpeg",
]);
const hash = (v: Uint8Array | string) => createHash("sha256").update(v).digest("hex");
const same = (a: Stats, b: Stats) =>
  a.dev === b.dev &&
  a.ino === b.ino &&
  a.size === b.size &&
  a.mtimeMs === b.mtimeMs &&
  a.ctimeMs === b.ctimeMs;
const inside = (root: string, file: string) => {
  const rel = path.relative(root, file);
  return (
    !!rel && !path.isAbsolute(rel) && rel !== ".." && !rel.startsWith(".." + path.sep)
  );
};
export const safePeerFilename = (name: string) =>
  !!name &&
  name.length <= 200 &&
  !/[\\/\u0000-\u001f]/.test(name) &&
  !excludedLocalName(name) &&
  extensions.has(path.extname(name).toLowerCase());
type Setting = { root: string; automatic: boolean; dev: number; ino: number };
type Entry = {
  file: PeerFile;
  path: string;
  stat: Stats;
  root: string;
  rootStat: Stats;
  expires: number;
};

/** Only explicit native selections populate settings. Renderer input never becomes a path. */
export class PeerFileStore {
  private entries = new Map<string, Entry>();
  constructor(readonly directory: string) {}
  private key(scope: string) {
    return hash(scope);
  }
  private receivedKey(scope: string) {
    try {
      return hash(JSON.stringify(JSON.parse(scope).slice(0, 2)));
    } catch {
      return hash(scope);
    }
  }
  private async setting(scope: string): Promise<Setting | null> {
    try {
      return JSON.parse(
        await fs.readFile(path.join(this.directory, this.key(scope) + ".json"), "utf8"),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }
  async folder(scope: string): Promise<PeerFolder> {
    const s = await this.setting(scope);
    return {
      configured: !!s,
      label: s ? path.basename(s.root) : "",
      automatic: s?.automatic ?? false,
    };
  }
  async configure(scope: string, root: string, automatic: boolean) {
    const stat = await fs.lstat(root);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (await fs.realpath(root)) !== root
    )
      throw Error("请选择普通文件夹，不支持链接或映射目录。");
    await fs.mkdir(this.directory, { recursive: true });
    const target = path.join(this.directory, this.key(scope) + ".json"),
      temp = target + "." + randomUUID() + ".tmp";
    await fs.writeFile(
      temp,
      JSON.stringify({ root, automatic, dev: stat.dev, ino: stat.ino }),
      { mode: 0o600, flag: "wx" },
    );
    await fs.rename(temp, target);
    this.clear(scope);
    return this.folder(scope);
  }
  clear(scope: string) {
    for (const key of this.entries.keys())
      if (key.startsWith(this.key(scope) + ":")) this.entries.delete(key);
  }
  async revoke(scope: string) {
    this.clear(scope);
    await fs.rm(path.join(this.directory, this.key(scope) + ".json"), { force: true });
  }
  private async checked(entry: Entry) {
    if (entry.expires < Date.now()) throw Error("资料选择已过期，请重新请求。");
    const root = await fs.lstat(entry.root);
    if (
      root.isSymbolicLink() ||
      !root.isDirectory() ||
      root.dev !== entry.rootStat.dev ||
      root.ino !== entry.rootStat.ino
    )
      throw Error("共享文件夹已变化，请重新设置。");
    if (!inside(entry.root, entry.path)) throw Error("文件不在共享范围。");
    let current = entry.root;
    for (const part of path.relative(entry.root, entry.path).split(path.sep)) {
      if (excludedLocalName(part)) throw Error("文件不在共享范围。");
      current = path.join(current, part);
      if ((await fs.lstat(current)).isSymbolicLink()) throw Error("不读取文件链接。");
    }
    if ((await fs.realpath(entry.path)) !== entry.path) throw Error("文件位置已变化。");
    const handle = await fs.open(
      entry.path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    try {
      const before = await handle.stat();
      if (
        !before.isFile() ||
        before.size < 1 ||
        before.size > peerFileLimit ||
        !same(before, entry.stat)
      )
        throw Error("文件已变化，请重新请求。");
      const bytes = await handle.readFile();
      const after = await handle.stat();
      if (
        !same(before, after) ||
        !same(after, await fs.lstat(entry.path)) ||
        bytes.length !== before.size
      )
        throw Error("文件在读取中变化，请重新请求。");
      return bytes;
    } finally {
      await handle.close();
    }
  }
  async search(scope: string, requestId: string, query: string) {
    if (
      !/^[A-Za-z0-9_-]{1,128}$/.test(requestId) ||
      !query.trim() ||
      query.length > 300
    )
      throw Error("资料请求无效。");
    const setting = await this.setting(scope);
    if (!setting) throw Error("请先选择共享文件夹。");
    const rootStat = await fs.lstat(setting.root);
    if (
      rootStat.dev !== setting.dev ||
      rootStat.ino !== setting.ino ||
      rootStat.isSymbolicLink()
    )
      throw Error("共享目录已变化，请重新选择。");
    const prefix = this.key(scope) + ":" + requestId + ":";
    for (const key of this.entries.keys())
      if (key.startsWith(prefix)) this.entries.delete(key);
    const files: PeerFile[] = [],
      terms = query
        .toLowerCase()
        .split(/[\s,，;；]+/)
        .filter(Boolean),
      started = Date.now();
    let visited = 0,
      truncated = false;
    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > 12) {
        truncated = true;
        return;
      }
      const entries = await fs.opendir(dir);
      for await (const item of entries) {
        if (++visited > 10000 || Date.now() - started > 3000 || files.length >= 10) {
          truncated = true;
          break;
        }
        if (excludedLocalName(item.name) || item.isSymbolicLink()) continue;
        const filePath = path.join(dir, item.name);
        if (item.isDirectory()) {
          await walk(filePath, depth + 1);
          continue;
        }
        if (
          !item.isFile() ||
          !safePeerFilename(item.name) ||
          !terms.every((t) => item.name.toLowerCase().includes(t))
        )
          continue;
        const stat = await fs.lstat(filePath);
        if (stat.size < 1 || stat.size > peerFileLimit) continue;
        const id = randomUUID(),
          entry: Entry = {
            path: filePath,
            stat,
            root: setting.root,
            rootStat,
            expires: Date.now() + 30 * 60000,
            file: {
              id,
              name: item.name,
              size: stat.size,
              modifiedAt: stat.mtime.toISOString(),
              sha256: "",
            },
          };
        try {
          const bytes = await this.checked(entry);
          entry.file.sha256 = hash(bytes);
          this.entries.set(prefix + id, entry);
          files.push(entry.file);
        } catch {
          /* A changing or inaccessible file is not offered. */
        }
      }
    };
    await walk(setting.root, 0);
    for (const [key, value] of this.entries)
      if (value.expires < Date.now()) this.entries.delete(key);
    for (const key of this.entries.keys()) {
      if (this.entries.size <= 500) break;
      if (!key.startsWith(prefix)) this.entries.delete(key);
    }
    return { files, truncated };
  }
  async read(scope: string, requestId: string, fileId: string) {
    const setting = await this.setting(scope),
      entry = this.entries.get(this.key(scope) + ":" + requestId + ":" + fileId);
    if (!setting || !entry || setting.root !== entry.root)
      throw Error("资料授权已失效，请重新请求。");
    const bytes = await this.checked(entry);
    if (hash(bytes) !== entry.file.sha256) throw Error("文件版本已变化，请重新请求。");
    return new Uint8Array(bytes);
  }
  async received(scope: string): Promise<PeerReceived[]> {
    const directory = path.join(this.directory, this.receivedKey(scope), "received");
    let names: string[];
    try {
      names = await fs.readdir(directory);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
    const results: PeerReceived[] = [];
    for (const name of names
      .filter((n) => /^[a-f0-9]{64}\.json$/.test(n))
      .slice(-500)) {
      const r = JSON.parse(await fs.readFile(path.join(directory, name), "utf8"));
      results.push(r);
    }
    return results.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }
  async save(
    scope: string,
    requestId: string,
    file: PeerFile,
    bytes: Uint8Array,
    providerName: string,
  ): Promise<PeerReceived> {
    if (
      !safePeerFilename(file.name) ||
      bytes.byteLength > peerFileLimit ||
      bytes.byteLength !== file.size ||
      hash(bytes) !== file.sha256
    )
      throw Error("文件大小或校验不一致，未保存。");
    const id = hash(requestId + ":" + file.id + ":" + file.sha256),
      directory = path.join(this.directory, this.receivedKey(scope), "received");
    await fs.mkdir(directory, { recursive: true });
    const value: PeerReceived = {
      id,
      requestId,
      name: file.name,
      size: file.size,
      sha256: file.sha256,
      receivedAt: new Date().toISOString(),
      providerName,
    };
    const target = path.join(directory, id + path.extname(file.name).toLowerCase());
    try {
      await fs.writeFile(target, bytes, { flag: "wx", mode: 0o600 });
    } catch (e) {
      if (
        (e as NodeJS.ErrnoException).code !== "EEXIST" ||
        hash(await fs.readFile(target)) !== file.sha256
      )
        throw e;
    }
    const metadata = path.join(directory, id + ".json");
    try {
      await fs.writeFile(metadata, JSON.stringify(value), { flag: "wx", mode: 0o600 });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      return JSON.parse(await fs.readFile(metadata, "utf8"));
    }
    return value;
  }
  async receivedPath(scope: string, id: string) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw Error("文件不存在。");
    const r = (await this.received(scope)).find((v) => v.id === id);
    if (!r || !safePeerFilename(r.name)) throw Error("文件不存在。");
    const target = path.join(
      this.directory,
      this.receivedKey(scope),
      "received",
      id + path.extname(r.name).toLowerCase(),
    );
    const stat = await fs.lstat(target);
    if (
      stat.isSymbolicLink() ||
      !stat.isFile() ||
      stat.size !== r.size ||
      hash(await fs.readFile(target)) !== r.sha256
    )
      throw Error("本机文件已变化，请重新获取。");
    return target;
  }
}
