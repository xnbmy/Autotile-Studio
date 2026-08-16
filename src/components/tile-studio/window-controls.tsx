"use client"

import { getCurrentWindow } from "@tauri-apps/api/window"
import { Minus, Square, X } from "lucide-react"

// 仅在 Tauri 桌面端暴露窗口控制；浏览器下为 null
export const isTauriDesktop =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
const appWindow = isTauriDesktop ? getCurrentWindow() : null

/** 桌面端窗口控制按钮（最小化 / 最大化 / 关闭），非 Tauri 环境渲染为空 */
export function WindowControls() {
  if (!appWindow) return null
  return (
    <div className="flex items-center">
      <button
        type="button"
        aria-label="最小化"
        onClick={() => appWindow.minimize()}
        className="flex h-7 w-9 items-center justify-center rounded-l-md border border-l border-y text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Minus className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="最大化"
        onClick={() => appWindow.toggleMaximize()}
        className="flex h-7 w-9 items-center justify-center border-y text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Square className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="关闭"
        onClick={() => appWindow.close()}
        className="flex h-7 w-9 items-center justify-center rounded-r-md border border-r border-y text-muted-foreground hover:bg-red-500 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}