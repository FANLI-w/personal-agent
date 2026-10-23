import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import { parsePeerRequest, parsePeerFile } from "../utils/peerProtocol";
import { authority } from "./localFolderManage";
import { peerAuthority } from "./peerLibraryAuthority";
import { PeerFileStore } from "../utils/peerFiles";

export function registerPeerLibraryBridge() {
  const files = new PeerFileStore(path.join(app.getPath("userData"), "peer-library"));
  ipcMain.handle("peer-library-folder", async (event, value) =>
    files.folder((await peerAuthority(event, value)).key),
  );
  ipcMain.handle("peer-library-configure", async (event, value, automatic) => {
    const { auth, key } = await peerAuthority(event, value);
    if (typeof automatic !== "boolean") throw Error("共享设置无效。");
    const window = BrowserWindow.fromWebContents(auth.contents);
    if (!window) throw Error("窗口已关闭。");
    const selected = await dialog.showOpenDialog(window, {
      title: automatic
        ? "选择允许当前课题组自动获取文件的专用目录"
        : "选择需逐次同意的资料目录",
      properties: ["openDirectory"],
    });
    if (selected.canceled || !selected.filePaths[0]) return null;
    if (authority(event).owner !== auth.owner) throw Error("页面已变化，请重新选择。");
    if ((await peerAuthority(event, value)).key !== key)
      throw Error("账号或课题组已变化，请重新选择。");
    return files.configure(key, selected.filePaths[0], automatic);
  });
  ipcMain.handle("peer-library-revoke", async (event, value) =>
    files.revoke((await peerAuthority(event, value)).key),
  );
  ipcMain.handle("peer-library-search", async (event, value, raw) => {
    const checked = await peerAuthority(event, value, parsePeerRequest(raw).id),
      { auth, key } = checked,
      request = checked.request!,
      folder = await files.folder(key);
    if (
      request.providerId !== value.memberId ||
      request.labId !== value.labId ||
      request.status !== "requested" ||
      Date.parse(request.expiresAt) <= Date.now()
    )
      throw Error("请求身份或状态无效。");
    if (!folder.configured) throw Error("请先设置资料目录。");
    if (!folder.automatic) {
      const window = BrowserWindow.fromWebContents(auth.contents);
      if (!window) throw Error("窗口已关闭。");
      const answer = await dialog.showMessageBox(window, {
        type: "question",
        title: "同事请求资料",
        message: `${request.requesterName} 请求：${request.query}`,
        detail: `同意后仅从“${folder.label}”按文件名查找，匹配文件可由请求人选择接收。`,
        buttons: ["拒绝", "同意本次"],
        defaultId: 0,
        cancelId: 0,
      });
      if (answer.response !== 1) return null;
    }
    if (authority(event).owner !== auth.owner) throw Error("页面已变化。");
    const current = await peerAuthority(event, value, request.id);
    if (
      current.key !== key ||
      current.request?.status !== "requested" ||
      current.request.version !== request.version
    )
      throw Error("请求已变化，请重新处理。");
    const result = await files.search(key, request.id, request.query);
    const latest = await peerAuthority(event, value, request.id);
    if (latest.key !== key || latest.request?.version !== request.version)
      throw Error("请求权限已变化。");
    return result;
  });
  ipcMain.handle("peer-library-read", async (event, value, requestId, fileId) => {
    const { key, request } = await peerAuthority(event, value, requestId);
    if (
      !request ||
      request.providerId !== value.memberId ||
      request.labId !== value.labId ||
      request.status !== "selected" ||
      request.selectedFileId !== fileId ||
      Date.parse(request.expiresAt) <= Date.now()
    )
      throw Error("当前文件请求已变化。");
    const bytes = await files.read(key, requestId, fileId);
    const current = await peerAuthority(event, value, requestId);
    if (
      current.key !== key ||
      current.request?.status !== "selected" ||
      current.request.version !== request.version
    )
      throw Error("请求权限已变化，未发送文件。");
    return bytes;
  });
  ipcMain.handle("peer-library-save", async (event, value, raw, rawFile, bytes) => {
    const { key, request: current } = await peerAuthority(
        event,
        value,
        parsePeerRequest(raw).id,
      ),
      request = current!,
      file = parsePeerFile(rawFile);
    if (
      request.requesterId !== value.memberId ||
      request.labId !== value.labId ||
      request.status !== "selected" ||
      request.selectedFileId !== file.id ||
      !request.files.some(
        (f) =>
          f.id === file.id &&
          f.sha256 === file.sha256 &&
          f.name === file.name &&
          f.size === file.size,
      )
    )
      throw Error("文件与当前请求不一致。");
    if (!(bytes instanceof Uint8Array)) throw Error("文件传输无效。");
    return files.save(key, request.id, file, bytes, request.providerName);
  });
  ipcMain.handle("peer-library-received", async (event, value) =>
    files.received((await peerAuthority(event, value)).key),
  );
  ipcMain.handle("peer-library-open", async (event, value, id) => {
    const { key } = await peerAuthority(event, value);
    const target = await files.receivedPath(key, id);
    if ((await peerAuthority(event, value)).key !== key)
      throw Error("账号已变化，请重新打开。");
    const result = await shell.openPath(target);
    if (result) throw Error(result);
  });
}
