import {
  BrowserWindow,
  clipboard,
  ipcMain,
  nativeImage,
  screen,
  type IpcMainInvokeEvent,
} from "electron";
import path from "node:path";
import { authority } from "./localFolderManage";
import type { ChatScreenCapture } from "../../src/types/chatScreenshot";
import { screenshotEditorHtml } from "../utils/screenshotEditorHtml";
export function registerScreenshotEditor(
  capture: (event: IpcMainInvokeEvent) => Promise<ChatScreenCapture[]>,
) {
  let active:
    | {
        window: BrowserWindow;
        sender: Electron.WebContents;
        event: IpcMainInvokeEvent;
        owner: unknown;
        finish: (image: string | null) => void;
      }
    | undefined;
  let opening = false,
    epoch = 0;
  let openingSender: Electron.WebContents | undefined;
  ipcMain.handle("chat-screenshot-editor-result", async (event, image: unknown) => {
    const current = active;
    if (
      !current ||
      event.sender !== current.window.webContents ||
      event.senderFrame !== event.sender.mainFrame
    )
      throw new Error("截图窗口无效。");
    if (image === null) {
      current.finish(null);
      return;
    }
    if (authority(current.event).owner !== current.owner) {
      current.finish(null);
      throw new Error("会话已变化，截图已取消。");
    }
    if (
      typeof image !== "string" ||
      image.length > 14 * 1024 * 1024 ||
      !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image)
    )
      throw new Error("截图超过10MB或格式无效，请重新框选。");
    const bytes = Buffer.from(image.slice(image.indexOf(",") + 1), "base64");
    if (bytes.length > 10 * 1024 * 1024) throw new Error("截图超过10MB，请重新框选。");
    const picture = nativeImage.createFromDataURL(image),
      size = picture.getSize();
    if (
      picture.isEmpty() ||
      size.width < 4 ||
      size.height < 4 ||
      size.width * size.height > 20_000_000
    )
      throw new Error("截图尺寸无效，请重新框选。");
    clipboard.writeImage(picture);
    current.finish(image);
  });
  ipcMain.handle("cancel-chat-screenshot", (event) => {
    authority(event);
    if (openingSender === event.sender) epoch++;
    if (active?.sender === event.sender) active.finish(null);
  });
  ipcMain.handle("edit-chat-screenshot", async (event) => {
    const auth = authority(event);
    if (opening || active) throw new Error("已有截图正在编辑。");
    opening = true;
    openingSender = event.sender;
    const requestEpoch = ++epoch;
    try {
      const captures = await capture(event);
      if (requestEpoch !== epoch) return null;
      if (authority(event).owner !== auth.owner)
        throw new Error("会话已变化，截图已取消。");
      const parent = BrowserWindow.fromWebContents(auth.contents);
      if (!parent || parent.isDestroyed()) return null;
      const display = screen.getDisplayMatching(parent.getBounds());
      const selected = Math.max(
        0,
        captures.findIndex((c) => c.displayId === String(display.id)),
      );
      const overlay = new BrowserWindow({
        ...display.bounds,
        frame: false,
        show: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        backgroundColor: "#111111",
        webPreferences: {
          preload: path.join(__dirname, "../preload/screenshotEditor.js"),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
          partition: "screenshot-editor",
        },
      });
      overlay.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      overlay.webContents.on("will-navigate", (e) => e.preventDefault());
      return await new Promise<string | null>((resolve, reject) => {
        let ended = false;
        const finish = (image: string | null) => {
          if (ended) return;
          ended = true;
          clearInterval(watch);
          clearTimeout(expiry);
          active = undefined;
          if (!overlay.isDestroyed()) overlay.destroy();
          resolve(image);
        };
        const watch = setInterval(() => {
          try {
            if (parent.isDestroyed() || authority(event).owner !== auth.owner)
              finish(null);
          } catch {
            finish(null);
          }
        }, 250);
        const expiry = setTimeout(() => finish(null), 5 * 60 * 1000);
        active = {
          window: overlay,
          sender: event.sender,
          event,
          owner: auth.owner,
          finish,
        };
        overlay.once("closed", () => finish(null));
        overlay.webContents.once("render-process-gone", () => finish(null));
        void overlay
          .loadURL(
            "data:text/html;charset=utf-8," +
              encodeURIComponent(screenshotEditorHtml(captures, selected)),
          )
          .then(() => {
            if (!ended) {
              overlay.show();
              overlay.focus();
            }
          })
          .catch((error) => {
            reject(error);
            finish(null);
          });
      });
    } finally {
      opening = false;
      openingSender = undefined;
    }
  });
}
