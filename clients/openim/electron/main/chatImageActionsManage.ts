import { BrowserWindow, clipboard, dialog, ipcMain, nativeImage } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { chatImageFilename, chatImageFormat } from "../utils/chatImageFormat";
import { authority } from "./localFolderManage";
import { imagePasteLimits } from "../utils/imagePasteLimits";
import { validateImageSize } from "../utils/imageOcrLayout";

function imageBytes(bytes: unknown) {
  if (
    !(bytes instanceof Uint8Array) ||
    !bytes.length ||
    bytes.length > imagePasteLimits.bytes
  )
    throw new Error("图片数据无效或超过 10 MB。");
  const buffer = Buffer.from(bytes);
  return { buffer, format: chatImageFormat(buffer) };
}

export function registerChatImageActionsBridge() {
  ipcMain.handle("copy-chat-image", (event, bytes: Uint8Array) => {
    authority(event);
    const { buffer, format } = imageBytes(bytes);
    if (format.extension !== "png") throw new Error("复制图片需要 PNG 像素数据。");
    const image = nativeImage.createFromBuffer(buffer);
    if (image.isEmpty()) throw new Error("图片无法读取，请重新获取原图。");
    const { width, height } = image.getSize();
    validateImageSize(width, height);
    clipboard.writeImage(image);
  });
  ipcMain.handle(
    "save-chat-image",
    async (event, filename: string, bytes: Uint8Array) => {
      const auth = authority(event);
      if (typeof filename !== "string" || filename.length > 500)
        throw new Error("图片名称无效。");
      const { buffer, format } = imageBytes(bytes);
      const parent = BrowserWindow.fromWebContents(auth.contents);
      if (!parent) throw new Error("当前窗口已关闭。");
      const result = await dialog.showSaveDialog(parent, {
        title: "图片另存为",
        defaultPath: chatImageFilename(filename, format.extension),
        filters: [
          {
            name: "图片",
            extensions:
              format.extension === "jpg" ? ["jpg", "jpeg"] : [format.extension],
          },
        ],
        properties: ["showOverwriteConfirmation"],
      });
      if (result.canceled || !result.filePath) return false;
      if (authority(event).owner !== auth.owner)
        throw new Error("当前窗口已变化，请重新保存。");
      // Write only the exact path confirmed by the native dialog, including its overwrite prompt.
      const destination = result.filePath;
      const extension = path.extname(destination).slice(1).toLowerCase();
      if (
        extension !== format.extension &&
        !(format.extension === "jpg" && extension === "jpeg")
      )
        throw new Error(`请使用 .${format.extension} 后缀，保留原图格式。`);
      await fs.writeFile(destination, buffer);
      return true;
    },
  );
}
