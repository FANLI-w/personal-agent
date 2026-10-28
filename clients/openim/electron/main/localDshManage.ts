import { app, BrowserView, BrowserWindow, dialog, ipcMain, session, shell } from "electron";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { authority } from "./localFolderManage";
import { getStore } from "./storeManage";
import type { DshBounds } from "../../src/types/localDsh";
// Built independently by vite.config.ts; the packaged module has no repository-relative imports.
const { LocalDshRuntime, inspectInstallation, dshBrowserCompatibility } = require("./localDshRuntime") as typeof import("../../../../integrations/deepseek-harness/desktop/local-runtime");

export function registerLocalDshBridge() {
  let view: BrowserView | undefined, owner: BrowserWindow | undefined;
  let pageReady = false, pageError = "", starting: Promise<void> | undefined;
  let quitting = false, observed: Electron.WebContents | undefined;
  const runtime = new LocalDshRuntime(
    String(getStore().get("localDshDirectory") || "D:\\0cat\\dsh"),
    path.join(app.getPath("userData"), "local-dsh", "home"),
    () => { if (runtime.state.phase !== "running") disposeView(); },
  );
  const snapshot = () => ({ ...runtime.state, ...(pageError ? { error: pageError } : {}), pageReady });
  const hide = () => { if (view && owner && !owner.isDestroyed()) owner.removeBrowserView(view); };
  function disposeView() {
    hide();
    if (view && !view.webContents.isDestroyed()) view.webContents.close();
    view = undefined;
    pageReady = false;
  }
  const isPage = (url: string) => { try { return new URL(url).hash.split("?")[0] === "#/dsh"; } catch { return false; } };
  function authorize(event: Electron.IpcMainInvokeEvent, requirePage = true) {
    const auth = authority(event);
    if (requirePage && !isPage(auth.contents.getURL())) throw Error("请在 DSH 页面操作。");
    const window = BrowserWindow.fromWebContents(auth.contents);
    if (!window) throw Error("应用窗口已关闭。");
    owner = window;
    if (observed !== auth.contents) {
      observed = auth.contents;
      auth.contents.on("did-navigate-in-page", (_e, url, main) => {
        if (!main) return;
        if (!isPage(url)) hide();
        if (new URL(url).hash.startsWith("#/login")) void stop().catch(() => {});
      });
      auth.contents.on("did-start-navigation", (_e, _url, inPlace, main) => {
        if (main && !inPlace) void stop().catch(() => {});
      });
      auth.contents.on("destroyed", () => { void stop().catch(() => {}); });
      auth.contents.on("render-process-gone", () => { void stop().catch(() => {}); });
    }
    return auth;
  }
  async function stop() {
    disposeView();
    pageError = "";
    await runtime.stop();
    await starting?.catch(() => {});
  }
  function openExternal(url: string) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:" && !parsed.username && !parsed.password)
        void shell.openExternal(parsed.href);
    } catch { /* Ignore non-web schemes. */ }
  }
  async function start(event: Electron.IpcMainInvokeEvent) {
    if (starting) return starting;
    const auth = authorize(event);
    starting = (async () => {
      pageError = "";
      const url = await runtime.start();
      // Do not mount a late startup over another conversation or a replaced document.
      if (authority(event).owner !== auth.owner || runtime.state.phase !== "running") return;
      if (view && !view.webContents.isDestroyed()) return;
      const isolated = session.fromPartition(`acceptcat-dsh-${randomUUID()}`);
      isolated.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
      isolated.setPermissionCheckHandler(() => false);
      const current = new BrowserView({ webPreferences: {
        session: isolated, nodeIntegration: false, contextIsolation: true,
        sandbox: true, webSecurity: true, spellcheck: false,
      } });
      view = current;
      const origin = new URL(url).origin;
      current.webContents.setWindowOpenHandler(({ url: target }) => {
        openExternal(target);
        return { action: "deny" };
      });
      current.webContents.on("will-navigate", (e, target) => {
        if (new URL(target).origin !== origin) { e.preventDefault(); openExternal(target); }
      });
      current.webContents.on("will-redirect", (e, target) => {
        if (new URL(target).origin !== origin) e.preventDefault();
      });
      current.webContents.on("render-process-gone", () => {
        pageError = "DSH 页面意外退出，请停止后重新启动。";
        disposeView();
      });
      current.webContents.on("did-fail-load", (_e, code, _description, _url, main) => {
        if (main && code !== -3) { pageReady = false; hide(); pageError = "DSH 页面加载失败，请停止后重新启动。"; }
      });
      try {
        await current.webContents.loadURL("about:blank");
        current.webContents.debugger.attach("1.3");
        await current.webContents.debugger.sendCommand("Page.enable");
        await current.webContents.debugger.sendCommand("Page.addScriptToEvaluateOnNewDocument", { source: dshBrowserCompatibility });
        await current.webContents.loadURL(url);
        if (view === current && runtime.state.phase === "running") pageReady = true;
      } catch {
        if (view === current) { disposeView(); pageError = "DSH 页面加载失败，请停止后重新启动。"; }
      }
    })().finally(() => { starting = undefined; });
    return starting;
  }
  ipcMain.handle("local-dsh-status", (event) => { authorize(event); return snapshot(); });
  ipcMain.handle("local-dsh-choose", async (event) => {
    const auth = authorize(event);
    if (!["stopped", "error"].includes(runtime.state.phase)) throw Error("请先停止 DSH。");
    const result = await dialog.showOpenDialog(owner!, { title: "选择 DeepSeek Harness 安装目录", properties: ["openDirectory", "dontAddToRecent"] });
    if (authority(event).owner !== auth.owner) throw Error("页面已变化，请重试。");
    if (!result.canceled && result.filePaths.length === 1) {
      await inspectInstallation(result.filePaths[0]);
      authorize(event);
      runtime.configure(result.filePaths[0]);
      getStore().set("localDshDirectory", result.filePaths[0]);
    }
    return snapshot();
  });
  ipcMain.handle("local-dsh-start", async (event) => { authorize(event); await start(event); return snapshot(); });
  ipcMain.handle("local-dsh-stop", async (event) => {
    authorize(event);
    const result = await dialog.showMessageBox(owner!, {
      type: "question", message: "停止本地 DSH？", detail: "进行中的本地任务会中断，已保存的历史和配置会保留。",
      buttons: ["继续运行", "停止 DSH"], defaultId: 0, cancelId: 0,
    });
    authorize(event);
    if (result.response === 1) await stop();
    return snapshot();
  });
  ipcMain.handle("local-dsh-show", (event, bounds: DshBounds | null) => {
    authorize(event, bounds !== null);
    if (!bounds) { hide(); return; }
    if (!pageReady || !view) return;
    const zoom = event.sender.getZoomFactor();
    const size = owner!.getContentBounds();
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) throw Error("页面尺寸无效。");
    const x = Math.max(72, Math.round(bounds.x * zoom)), y = Math.max(80, Math.round(bounds.y * zoom));
    const width = Math.min(Math.round(bounds.width * zoom), size.width - x);
    const height = Math.min(Math.round(bounds.height * zoom), size.height - y);
    if (width < 1 || height < 1) { hide(); return; }
    owner!.addBrowserView(view);
    view.setBounds({ x, y, width, height });
  });
  app.on("before-quit", (event) => {
    if (quitting || runtime.state.phase === "stopped") return;
    event.preventDefault();
    void stop().then(() => { quitting = true; app.quit(); }).catch(() => {
      void dialog.showMessageBox({ type: "error", message: "DSH 尚未停止，请在 DSH 页面停止后再退出 AcceptCat。" });
    });
  });
}
