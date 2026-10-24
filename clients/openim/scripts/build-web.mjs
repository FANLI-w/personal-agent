import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareWorkspaceForBuild } from './workspace-build.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
prepareWorkspaceForBuild(root);
const env = {
  ...process.env,
  VITE_RESEARCH_MODE: "true",
  VITE_RESEARCH_DEVTOOLS: "false",
};
for (const script of [
  path.join(root, "node_modules/vite/bin/vite.js"),
  path.join(root, "scripts/check-web-build.mjs"),
]) {
  const result = spawnSync(
    process.execPath,
    [script, ...(script.endsWith("vite.js") ? ["build"] : [])],
    { cwd: root, env, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
