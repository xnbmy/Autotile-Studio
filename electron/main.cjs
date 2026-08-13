// Electron 主进程：直接加载 Next.js 静态导出的 HTML。
const { app, BrowserWindow, ipcMain } = require("electron")
const path = require("path")

// 限制为单实例：第二个实例启动时聚焦已有窗口并退出自身
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
  return
}

let mainWindow = null

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0b0b0f",
    // 先隐藏窗口，等页面 ready-to-show 再显示，避免白屏并提升感知启动速度
    show: false,
    // 移除系统标题栏与菜单栏，UI 由应用自身绘制，框架整体跟随主题色
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  })

  mainWindow = win

  // 彻底移除应用菜单（含 Alt 键唤出的菜单栏）
  if (app.setMenu) app.setMenu(null)

  // 窗口控制 IPC
  ipcMain.on("win:minimize", () => win.minimize())
  ipcMain.on("win:toggle-maximize", () => {
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on("win:close", () => win.close())

  // 页面准备就绪后再显示窗口，减少白屏时间
  win.once("ready-to-show", () => {
    win.show()
    win.focus()
  })

  win.loadFile(path.join(__dirname, "..", "dist-static", "index.html"))

  win.on("closed", () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  if (app.setMenu) app.setMenu(null)
  createWindow()
})

// 第二个实例启动时，唤醒已有窗口
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

app.on("activate", () => {
  if (mainWindow) {
    mainWindow.show()
  } else if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
