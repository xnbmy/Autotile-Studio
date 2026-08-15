import { invoke, isTauri } from "@tauri-apps/api/core"

export function downloadCanvasAsPNG(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, "image/png")
}

/**
 * 导出 PNG：Tauri 环境弹出系统「另存为」对话框，由用户选择目标文件夹后写入文件；
 * 非 Tauri（浏览器调试）回退为直接下载。
 * @returns 保存后的完整路径；用户取消对话框或回退下载时返回 null。
 */
export async function saveCanvasAsPNG(canvas: HTMLCanvasElement, filename: string): Promise<string | null> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
  if (!blob) return null
  if (isTauri()) {
    const data = new Uint8Array(await blob.arrayBuffer())
    const path = await invoke<string | null>("choose_save_path", { suggestedName: filename })
    if (!path) return null // 用户取消对话框
    await invoke("write_bytes", { path, data })
    return path
  }
  downloadCanvasAsPNG(canvas, filename)
  return null
}