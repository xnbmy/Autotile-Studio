// Electron 预加载脚本：向渲染进程安全暴露窗口控制 API
const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("electronWindow", {
  minimize: () => ipcRenderer.send("win:minimize"),
  toggleMaximize: () => ipcRenderer.send("win:toggle-maximize"),
  close: () => ipcRenderer.send("win:close"),
  isElectron: true,
})
