import { BrowserWindow, desktopCapturer, ipcMain } from "electron";
import { authority } from "./localFolderManage";
import type { ChatScreenCapture } from "../../src/types/chatScreenshot";

/** One user-requested snapshot. Never polls the screen or writes captures to disk. */
export function registerChatScreenshotBridge() {
  let capturing = false;
  ipcMain.handle(
    "capture-chat-screens",
    async (event): Promise<ChatScreenCapture[]> => {
      const auth = authority(event);
      const parent = BrowserWindow.fromWebContents(auth.contents);
      if (!parent || !parent.isVisible() || !parent.isFocused())
        throw new Error("请在当前聊天窗口点击截图。");
      if (capturing) throw new Error("截图正在准备，请稍候。");
      capturing = true;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        parent.hide();
        // Let the compositor remove our window before taking the snapshot.
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (authority(event).owner !== auth.owner)
          throw new Error("窗口已变化，请重新截图。");
        const sources = await Promise.race([
          desktopCapturer.getSources({
            types: ["screen"],
            thumbnailSize: { width: 3840, height: 2160 },
            fetchWindowIcons: false,
          }),
          new Promise<never>((_, reject) => {
            deadline = setTimeout(
              () => reject(new Error("截图超时，请重新尝试。")),
              15000,
            );
          }),
        ]);
        if (authority(event).owner !== auth.owner)
          throw new Error("窗口已变化，请重新截图。");
        let total = 0;
        const captures = sources.slice(0, 8).flatMap((source, index) => {
          if (source.thumbnail.isEmpty()) return [];
          const dataUrl = source.thumbnail.toDataURL();
          total += dataUrl.length;
          if (total > 64 * 1024 * 1024)
            throw new Error("截图过大，请降低屏幕分辨率后重试。");
          return [{ id: source.id, name: `屏幕 ${index + 1}`, dataUrl }];
        });
        if (!captures.length)
          throw new Error("无法获取屏幕截图，请检查系统屏幕录制权限。");
        return captures;
      } finally {
        if (deadline) clearTimeout(deadline);
        capturing = false;
        if (!parent.isDestroyed()) {
          parent.show();
          parent.focus();
        }
      }
    },
  );
}
