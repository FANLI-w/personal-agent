import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

export function buildLocalDshRuntime(clientRoot, outfile) {
  const require = createRequire(path.join(clientRoot, "package.json"));
  const esbuild = createRequire(require.resolve("vite"))("esbuild");
  // Reuse the lockfile-pinned polyfill distribution already owned by plugin-legacy.
  const legacyRequire = createRequire(require.resolve("@vitejs/plugin-legacy"));
  if (legacyRequire("core-js/package.json").version !== "3.49.0")
    throw Error("Requalify DSH browser compatibility before changing core-js 3.49.0");
  const compatibility = esbuild.buildSync({
    stdin: { contents: 'import "core-js/actual";', resolveDir: clientRoot },
    alias: { "core-js/actual": legacyRequire.resolve("core-js/actual") },
    bundle: true, platform: "browser", format: "iife", target: "chrome108", minify: true, write: false,
  }).outputFiles[0].text;
  return esbuild.buildSync({
    entryPoints: [fileURLToPath(new URL("./local-runtime.ts", import.meta.url))],
    ...(outfile ? { outfile } : {}), write: Boolean(outfile),
    define: { AC_DSH_POLYFILLS: JSON.stringify(compatibility) },
    banner: { js: "/* core-js 3.49.0 — " + readFileSync(path.join(path.dirname(legacyRequire.resolve("core-js/package.json")), "LICENSE"), "utf8") + "\n*/" },
    bundle: true, platform: "node", format: "cjs", target: "node16",
  });
}
