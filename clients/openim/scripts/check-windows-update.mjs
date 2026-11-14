// Read-only release gate. Run after build:win, before publishing all three assets.
import { createRequire } from "node:module";
import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const updaterRequire = createRequire(require.resolve("electron-updater"));
const runtimeRequire = createRequire(updaterRequire.resolve("builder-util-runtime"));
const { load } = runtimeRequire("js-yaml");
const version = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8"),
).version;
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--allow-preview"))
  throw Error("Usage: node scripts/check-windows-update.mjs [--allow-preview]");
const allowPreview = args.includes("--allow-preview");
const stable = /^\d+\.\d+\.\d+$/.test(version);
const preview = /^\d+\.\d+\.\d+-preview\.(?:0|[1-9]\d*)$/.test(version);
if (!stable && !(allowPreview && preview))
  throw Error(
    allowPreview
      ? "Stable or x.y.z-preview.N semver required"
      : "Stable semver required",
  );
const directory = path.join(root, "release", "Base", version);
const name = `AcceptCat_${version}.exe`;
const bytes = readFileSync(path.join(directory, name));
// GitHub uses prerelease releases, with latest.yml for this configured provider.
const manifestName = "latest.yml";
const manifest = load(readFileSync(path.join(directory, manifestName), "utf8"));
const feed = load(
  readFileSync(
    path.join(directory, "win-unpacked", "resources", "app-update.yml"),
    "utf8",
  ),
);
const sha512 = createHash("sha512").update(bytes).digest("base64");
const need = (value, message) => {
  if (!value) throw Error(message);
};
need(
  manifest.version === version && manifest.files?.length === 1,
  "Update manifest version/files mismatch",
);
need(
  manifest.files[0].url === name &&
    manifest.files[0].sha512 === sha512 &&
    manifest.files[0].size === bytes.length,
  "Update executable checksum/size/name mismatch",
);
need(
  manifest.path === name && manifest.sha512 === sha512,
  "Legacy manifest fields mismatch",
);
need(
  statSync(path.join(directory, name + ".blockmap")).isFile(),
  "Missing executable blockmap",
);
need(
  feed.provider === "github" &&
    feed.owner === "luoyan96" &&
    feed.repo === "personal-agent" &&
    !feed.private &&
    !feed.token,
  "Unexpected packaged feed or embedded credential",
);
const report = {
  status: "passed",
  version,
  channel: preview ? "preview" : "stable",
  provider: "public GitHub Releases",
  bytes: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  sha512,
  assets: [name, name + ".blockmap", manifestName],
};
console.log(JSON.stringify(report, null, 2));
