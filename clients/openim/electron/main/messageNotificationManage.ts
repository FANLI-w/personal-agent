import { app, BrowserWindow, ipcMain, nativeImage } from "electron";
import { getWebContents, getResearchServiceStatus } from "./windowManage";

// Electron's bitmap format is premultiplied BGRA on Windows.
function unreadDot() {
  const bytes = Buffer.alloc(16 * 16 * 4);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const distance = Math.hypot(x - 7.5, y - 7.5);
    if (distance > 7) continue;
    const offset = (y * 16 + x) * 4;
    const border = distance > 5.5;
    bytes[offset] = border ? 255 : 68;
    bytes[offset + 1] = border ? 255 : 68;
    bytes[offset + 2] = border ? 255 : 239;
    bytes[offset + 3] = 255;
  }
  return nativeImage.createFromBitmap(bytes, { width: 16, height: 16 });
}

export function registerMessageNotificationBridge() {
  let previousCount = 0;
  let dot: ReturnType<typeof unreadDot>;
  ipcMain.handle("set-message-unread-count", (event, count: unknown) => {
    const contents = getWebContents();
    const status = getResearchServiceStatus();
    if (event.sender !== contents || event.senderFrame !== contents.mainFrame ||
        !status.connected || !status.rendererOrigin ||
        new URL(event.senderFrame.url).origin !== status.rendererOrigin)
      throw new Error("仅当前聊天页面可更新消息提醒");
    if (!Number.isSafeInteger(count) || (count as number) < 0)
      throw new Error("无效的未读消息数量");
    const unread = count as number;
    const window = BrowserWindow.fromWebContents(contents);
    if (!window || window.isDestroyed()) return;
    if (process.platform === "win32") {
      if (unread > 0) dot ??= unreadDot();
      window.setOverlayIcon(unread > 0 ? dot : null, unread > 0 ? `${unread} 条未读消息` : "");
      if (unread > previousCount && (!window.isVisible() || !window.isFocused()))
        window.flashFrame(true);
      else if (!unread) window.flashFrame(false);
    } else app.setBadgeCount(unread);
    previousCount = unread;
  });
}
