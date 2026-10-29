import { contextBridge, ipcRenderer, webUtils } from "electron";

// Match DSH rc.3's desktop extension points. Keep this preload separate from
// AcceptCat's application preload: the DSH document receives no app IPC or Node API.
if (process.isMainFrame && location.protocol === "http:" && location.hostname === "127.0.0.1") {
  contextBridge.exposeInMainWorld("__DSH_HOST_PATHS__", {
    // Use the same native File resolver as DSH Desktop. Synthetic browser Files
    // have no host path and retain DSH's attachment upload (as do images).
    pathFor: (file: File) => file instanceof File ? webUtils.getPathForFile(file) : "",
  });
  contextBridge.exposeInMainWorld("__DSH_DIRECTORY_PICKER__", {
    pick: () => ipcRenderer.invoke("local-dsh-pick-directory"),
  });
}
