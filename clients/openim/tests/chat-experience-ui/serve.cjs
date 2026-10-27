const path = require("node:path"),
  fs = require("node:fs"),
  { createRequire } = require("node:module");
const client = path.resolve(__dirname, "../..").replaceAll("\\", "/");
const requireClient = createRequire(client + "/package.json");
const esbuild = createRequire(requireClient.resolve("vite/package.json"))("esbuild"),
  sass = requireClient("sass");
const root = __dirname;
const output =
  process.env.ACCEPTCAT_CHAT_UI_OUTPUT ||
  path.join(require("node:os").tmpdir(), "acceptcat-chat-experience-ui");
const mocked = new Set([
  "useResearchContactChat",
  "SkillLibrary",
  "useAgentFileReading",
  "useAgentImageReading",
  "useScopedFileSender",
  "PersonalReceiptCard",
  "CreatedAgentChatButton",
  "AgentFileReadSummary",
  "ChatMoreActions",
  "LocalFolderAction",
  "DesktopWorkCard",
]);
const plugin = {
  name: "isolated-fixture",
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      let full = args.path.startsWith("@/")
        ? path.join(client, "src", args.path.slice(2))
        : args.path.startsWith(".")
        ? path.resolve(args.resolveDir, args.path)
        : args.path;
      full = full.replaceAll("\\", "/").replace(/\.(tsx?|jsx?)$/, "");
      if (full === client + "/src/store" || full === client + "/src/research/store")
        return { path: path.join(root, "mock-state.ts") };
      if (full === client + "/src/research/api")
        return { path: path.join(root, "mock-api.ts") };
      if (full === client + "/src/i18n") return { path: "i18n", namespace: "fixture" };
      if (full === client + "/src/research/ImagePasteTray")
        return { path: "images", namespace: "fixture" };
      if (
        (full.startsWith(client + "/src/research/") &&
          mocked.has(path.basename(full))) ||
        full.endsWith("/SendActionBar/useFileMessage") ||
        full.endsWith("/ChatFooter/useSendMessage") ||
        full === client + "/src/layout/MainContentWrap"
      )
        return { path: path.join(root, "stubs.tsx") };
    });
    build.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
      contents:
        args.path === "images"
          ? `export {ImageTray as default} from ${JSON.stringify(
              path.join(root, "stubs.tsx"),
            )};`
          : 'import i18next from "i18next"; export default i18next;',
      resolveDir: client,
      loader: "ts",
    }));
    build.onLoad({ filter: /\.scss$/ }, (args) => ({
      contents: sass.compile(args.path, {
        silenceDeprecations: ["legacy-js-api"],
        loadPaths: [client + "/node_modules"],
      }).css,
      loader: "css",
      resolveDir: path.dirname(args.path),
    }));
  },
};
(async () => {
  const ctx = await esbuild.context({
    entryPoints: [root + "/main.tsx"],
    outdir: output + "/dist",
    bundle: true,
    format: "esm",
    platform: "browser",
    jsx: "automatic",
    nodePaths: [client + "/node_modules"],
    alias: { "@": client + "/src" },
    loader: {
      ".png": "dataurl",
      ".svg": "dataurl",
      ".gif": "dataurl",
      ".jpg": "dataurl",
      ".mp3": "dataurl",
      ".woff2": "dataurl",
    },
    define: {
      "process.env.NODE_ENV": '"development"',
      "import.meta.env.VITE_RESEARCH_MODE": '"true"',
    },
    plugins: [plugin],
    logLevel: "warning",
  });
  fs.mkdirSync(output + "/dist", { recursive: true });
  fs.writeFileSync(
    output + "/dist/index.html",
    '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>AcceptCat 聊天交互 · 合成测试</title><link rel="stylesheet" href="tailwind.css"><link rel="stylesheet" href="main.css"></head><body><div id="root"></div><script type="module" src="main.js"></script></body></html>',
  );
  const css = await requireClient("postcss")([
    requireClient("tailwindcss")({
      ...requireClient(client + "/tailwind.config.js"),
      content: [client + "/src/**/*.{ts,tsx}"],
    }),
  ]).process("@tailwind base;@tailwind components;@tailwind utilities;", {
    from: undefined,
  });
  fs.writeFileSync(output + "/dist/tailwind.css", css.css);
  await ctx.rebuild();
  await ctx.watch();
  const server = await ctx.serve({
    host: "127.0.0.1",
    port: 4389,
    servedir: output + "/dist",
  });
  console.log("UI fixture http://127.0.0.1:" + server.port);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
