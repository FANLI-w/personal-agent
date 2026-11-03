import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * The research plugin ships inside the installer and is installed through DSH's
 * own package manager, so the profile stays DSH's: pnpm writes the manifest and
 * lockfile, and we only add the bundle name DSH needs to load it.
 */
export const researchPlugin = { name: "dsh-research-workbench", version: "0.3.3" };

type EnsureResult = { changed: boolean; version?: string; reason?: string };

function runPnpm(runtime: string, profile: string, args: string[]) {
  const pnpm = path.join(runtime, "resources", "runtime", "primary-runtime", "dependencies", "pnpm", "bin", "pnpm.mjs");
  if (!existsSync(pnpm)) return Promise.reject(Error("这个 DSH 版本没有内置 pnpm，暂时无法安装插件。"));
  return new Promise<void>((resolve, reject) => {
    // DSH runs pnpm through its own Electron binary; reuse that instead of
    // requiring a system Node or pnpm.
    const child = spawn(path.join(runtime, "DeepSeek Harness.exe"), ["--expose-internals", pnpm, ...args], {
      cwd: profile,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += String(chunk)));
    child.stderr.on("data", (chunk) => (output += String(chunk)));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(Error(`pnpm 退出码 ${code}：${output.trim().slice(-400)}`)),
    );
  });
}

async function installedVersion(profile: string) {
  try {
    const manifest = JSON.parse(await readFile(path.join(profile, "node_modules", researchPlugin.name, "package.json"), "utf8"));
    return typeof manifest.version === "string" ? manifest.version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Installs the bundled plugin when it is missing or older, then makes sure the
 * profile lists it as a bundle. A profile that DSH has not created yet is left
 * alone: DSH writes it on first start and we try again afterwards.
 */
export async function ensureResearchPlugin(input: {
  runtime: string;
  home: string;
  tarball: string;
}): Promise<EnsureResult> {
  const profile = path.join(input.home, "profiles", "web");
  const manifestPath = path.join(profile, "package.json");
  if (!existsSync(manifestPath)) return { changed: false, reason: "profile 尚未创建" };
  if (!existsSync(input.tarball)) return { changed: false, reason: "安装包内没有插件文件" };
  const current = await installedVersion(profile);
  const bundled = researchPlugin.version;
  let changed = false;
  if (current !== bundled) {
    // `file:` keeps the install offline; pnpm records it in the profile lockfile.
    await runPnpm(input.runtime, profile, ["add", `file:${input.tarball}`, "--offline", "--ignore-scripts"]);
    changed = true;
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const bundles: string[] = manifest?.dsh?.profile?.bundles ?? [];
  if (!bundles.includes(researchPlugin.name)) {
    manifest.dsh = { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles: [...bundles, researchPlugin.name] } };
    await mkdir(profile, { recursive: true });
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    changed = true;
  }
  return { changed, version: await installedVersion(profile) };
}
