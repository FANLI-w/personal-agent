import { promises as fs } from "node:fs";
import path from "node:path";

export type LocalLibraryFile = {
  /** Path relative to the registered folder; templates store this, not an absolute path. */
  rel: string;
  name: string;
  size: number;
  updatedAt: string;
};

export type LocalLibraryManifest = {
  root: string;
  name: string;
  files: LocalLibraryFile[];
  truncated: boolean;
};

/** Only documents and images are listed; a work folder full of code stays out of the way. */
const allowedExtensions = new Set([
  ".pptx",
  ".ppt",
  ".potx",
  ".docx",
  ".doc",
  ".pdf",
  ".xlsx",
  ".xls",
  ".csv",
  ".tsv",
  ".md",
  ".txt",
  ".png",
  ".jpg",
  ".jpeg",
  ".svg",
  ".drawio",
]);

const skippedDirectories = new Set([
  "node_modules",
  ".git",
  ".svn",
  "$RECYCLE.BIN",
  "System Volume Information",
]);

export const localLibraryLimits = {
  maxFiles: 2000,
  maxDepth: 6,
  scanMs: 6000,
} as const;

/** A relative path must stay inside the registered folder; `..` never escapes. */
export function insideRoot(root: string, candidate: string) {
  const rel = path.relative(root, candidate);
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

export function resolveInRoot(root: string, rel: string) {
  const resolved = path.resolve(root, rel);
  if (!insideRoot(root, resolved))
    throw new Error("这个文件不在登记的本地资料文件夹里。");
  return resolved;
}

export function libraryFileName(rel: string) {
  return rel.split(/[\\/]/).pop() || rel;
}

export async function scanLibrary(root: string): Promise<LocalLibraryManifest> {
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("登记的本地资料路径不是文件夹。");
  const files: LocalLibraryFile[] = [];
  const started = Date.now();
  let truncated = false;
  const directories: { absolute: string; depth: number }[] = [
    { absolute: root, depth: 0 },
  ];
  while (directories.length) {
    if (
      Date.now() - started > localLibraryLimits.scanMs ||
      files.length >= localLibraryLimits.maxFiles
    ) {
      truncated = true;
      break;
    }
    const directory = directories.shift()!;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(directory.absolute, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const absolute = path.join(directory.absolute, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".") || skippedDirectories.has(entry.name)) continue;
        if (directory.depth + 1 > localLibraryLimits.maxDepth) continue;
        directories.push({ absolute, depth: directory.depth + 1 });
        continue;
      }
      if (!entry.isFile()) continue;
      if (!allowedExtensions.has(path.extname(entry.name).toLowerCase())) continue;
      let info: import("node:fs").Stats;
      try {
        info = await fs.lstat(absolute);
      } catch {
        continue;
      }
      if (!info.isFile() || info.size < 1) continue;
      files.push({
        rel: path.relative(root, absolute),
        name: entry.name,
        size: info.size,
        updatedAt: info.mtime.toISOString(),
      });
      if (files.length >= localLibraryLimits.maxFiles) {
        truncated = true;
        break;
      }
    }
  }
  files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { root, name: path.basename(root), files, truncated };
}
