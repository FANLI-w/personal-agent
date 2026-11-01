import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getWebContents } from "./windowManage";
import {
  resolveInRoot,
  scanLibrary,
  type LocalLibraryManifest,
} from "../utils/localLibrary";

const settingsFile = () => path.join(app.getPath("userData"), "local-library.json");

type Settings = { root?: string };

async function readSettings(): Promise<Settings> {
  try {
    const value = JSON.parse(await fs.readFile(settingsFile(), "utf8"));
    return typeof value?.root === "string" && value.root.length < 4096
      ? { root: value.root }
      : {};
  } catch {
    return {};
  }
}

async function writeSettings(value: Settings) {
  await fs.writeFile(settingsFile(), JSON.stringify(value), "utf8");
}

/** Only the app window may read this; it is a local path, never an account fact. */
function assertSender(event: Electron.IpcMainInvokeEvent) {
  const contents = getWebContents();
  if (!contents || event.sender !== contents)
    throw new Error("本地资料文件夹只能在这个窗口里使用。");
}

/** The registered folder, or nothing. Callers decide whether that is an error. */
export async function localLibraryRoot() {
  const { root } = await readSettings();
  if (!root) return undefined;
  try {
    const stat = await fs.lstat(root);
    return stat.isDirectory() && !stat.isSymbolicLink() ? root : undefined;
  } catch {
    return undefined;
  }
}

export async function localLibraryPaths(rels: string[]) {
  const root = await localLibraryRoot();
  if (!root) throw new Error("还没有登记本地资料文件夹。");
  return rels.slice(0, 20).map((rel) => resolveInRoot(root, rel));
}

export function registerLocalLibraryBridge() {
  ipcMain.handle("local-library-status", async (event) => {
    assertSender(event);
    const { root } = await readSettings();
    if (!root) return { registered: false as const };
    const available = await localLibraryRoot();
    return {
      registered: true as const,
      available: !!available,
      root,
      name: path.basename(root),
    };
  });
  ipcMain.handle(
    "local-library-pick",
    async (event): Promise<LocalLibraryManifest | null> => {
      assertSender(event);
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) throw new Error("找不到窗口，无法选择文件夹。");
      const result = await dialog.showOpenDialog(window, {
        title: "选择实验室资料所在的本地文件夹（只记录路径，不上传）",
        properties: ["openDirectory", "dontAddToRecent"],
      });
      if (result.canceled || result.filePaths.length !== 1) return null;
      const root = result.filePaths[0]!;
      const manifest = await scanLibrary(root);
      await writeSettings({ root });
      return manifest;
    },
  );
  ipcMain.handle("local-library-scan", async (event): Promise<LocalLibraryManifest> => {
    assertSender(event);
    const root = await localLibraryRoot();
    if (!root) throw new Error("还没有登记本地资料文件夹。");
    return scanLibrary(root);
  });
}
