import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld(
  "screenshotEditor",
  Object.freeze({
    load: () => ipcRenderer.invoke("chat-screenshot-editor-data"),
    finish: (image: string | null) =>
      ipcRenderer.invoke("chat-screenshot-editor-result", image),
  }),
);
