import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { authority } from "./localFolderManage";

export function registerChatFileActionsBridge() {
  const saved = new Map<string, { owner: string; path: string; expires: number }>();
  ipcMain.handle(
    "save-chat-file",
    async (event, filename: string, bytes: Uint8Array) => {
      const auth = authority(event);
      if (
        typeof filename !== "string" ||
        !filename ||
        filename.length > 255 ||
        !(bytes instanceof Uint8Array) ||
        bytes.byteLength > 64 * 1024 * 1024
      )
        throw new Error("文件名称无效或文件超过64MB。");
      const name = filename
        .split(/[\\/]/)
        .pop()!
        .replace(/[<>:"|?*\x00-\x1f]/g, "_")
        .replace(/[ .]+$/, "");
      if (!name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))
        throw new Error("文件名称无效。");
      const parent = BrowserWindow.fromWebContents(auth.contents);
      if (!parent) throw new Error("聊天窗口已关闭。");
      const selected = await dialog.showSaveDialog(parent, {
        title: "文件另存为",
        defaultPath: name,
        properties: ["showOverwriteConfirmation"],
      });
      if (selected.canceled || !selected.filePath) return null;
      if (authority(event).owner !== auth.owner)
        throw new Error("窗口已变化，请重新保存。");
      await fs.writeFile(selected.filePath, bytes);
      if (authority(event).owner !== auth.owner) return null;
      for (const [id, entry] of saved) if (entry.expires < Date.now()) saved.delete(id);
      if (saved.size >= 128) saved.delete(saved.keys().next().value!);
      const token = randomUUID();
      saved.set(token, {
        owner: auth.owner,
        path: selected.filePath,
        expires: Date.now() + 30 * 60 * 1000,
      });
      return { token };
    },
  );
  ipcMain.handle("reveal-chat-file", async (event, token: string) => {
    const auth = authority(event),
      entry = saved.get(token);
    if (!entry || entry.owner !== auth.owner || entry.expires < Date.now())
      throw new Error("保存记录已失效，请重新另存文件。");
    await fs.access(entry.path);
    if (authority(event).owner !== auth.owner) throw new Error("窗口已变化。");
    shell.showItemInFolder(entry.path);
  });
}
