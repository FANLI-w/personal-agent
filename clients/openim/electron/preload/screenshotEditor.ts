import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld(
  "screenshotEditor",
  Object.freeze({
    finish: (image: string | null) =>
      ipcRenderer.invoke("chat-screenshot-editor-result", image),
  }),
);
