const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  apiRequest: async ({ method, path, body, headers }) => {
    return ipcRenderer.invoke("api-request", { method, path, body, headers });
  },
});
