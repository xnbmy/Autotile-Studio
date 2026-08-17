"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useEditorStore } from "@/lib/store"
import {
  DUAL16_COLORS,
  DUAL16_SLOT_KEYS,
  BLOB5_COLORS,
  BLOB5_SLOT_KEYS,
} from "@/lib/quadrant-stitch"
import { ZoomIn, ZoomOut, Maximize } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * 网格拾取内联视图：直接嵌入左栏，无弹窗遮罩。
 * 滚动缩放、Shift+拖拽 / 中键平移；点选格子立即绑定到当前槽位（store 自动跳下一空槽）。
 */
export function SlicePickerInline() {
  const image = useEditorStore((s) => s.modeBImage)
  const imageSize = useEditorStore((s) => s.modeBImageSize)
  const gridSize = useEditorStore((s) => s.modeBGridSize)
  const slot = useEditorStore((s) => s.modeBSlot)
  const slots = useEditorStore((s) => s.modeBSlots)
  const assignCell = useEditorStore((s) => s.assignModeBCell)
  const assignModeBSlotFree = useEditorStore((s) => s.assignModeBSlotFree)
  const setImage = useEditorStore((s) => s.setModeBImage)
  const setSlot = useEditorStore((s) => s.setModeBSlot)
  const mappingType = useEditorStore((s) => s.mappingType)
  const sliceFreePlace = useEditorStore((s) => s.sliceFreePlace)
  const modeBSlotFreePos = useEditorStore((s) => s.modeBSlotFreePos)
  const slotCropPos = useEditorStore((s) => s.slotCropPos)

  const isDual16 = mappingType === "16"
  const slotKeys: string[] = isDual16 ? DUAL16_SLOT_KEYS : BLOB5_SLOT_KEYS
  const slotColors: Record<string, string> = isDual16 ? DUAL16_COLORS : BLOB5_COLORS

  const [view, setView] = useState({ zoom: 1, pan: { x: 0, y: 0 } })
  const { zoom, pan } = view
  const panning = useRef(false)
  const panStart = useRef({ x: 0, y: 0, px: 0, py: 0 })
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  // 拖拽图片悬停高亮
  const [dragActive, setDragActive] = useState(false)
  // 自由放置拖动：ref 存拖动中的槽位与坐标，state 驱动实时重绘
  const freeDragRef = useRef<{ slot: string; x: number; y: number } | null>(null)
  const [liveFreePos, setLiveFreePos] = useState<{ slot: string; x: number; y: number } | null>(null)

  // 全局拦截 dragover/drop，防止 WebView 在拖放图片时默认导航走掉（拖入无效的常见根因）
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault()
    window.addEventListener("dragover", prevent)
    window.addEventListener("drop", prevent)
    return () => {
      window.removeEventListener("dragover", prevent)
      window.removeEventListener("drop", prevent)
    }
  }, [])

  /** 读取拖入的图片并写入 store，自动选中第一个未绑定槽位。
   *  不依赖 file.type（WebView 拖入的文件 type 可能为空），交给 Image 加载自校验。 */
  function handleDroppedFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        setImage(reader.result as string, { w: img.width, h: img.height })
        // 切换图片时 store 已自动清空槽位，这里激活第一个槽位
        setSlot(slotKeys[0])
      }
      img.onerror = () => {
        /* 非图片文件：忽略 */
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  const cols = imageSize ? Math.floor(imageSize.w / gridSize) : 0
  const rows = imageSize ? Math.floor(imageSize.h / gridSize) : 0
  const baseW = cols * gridSize
  const baseH = rows * gridSize
  // 世界坐标 = 图片四周各留一圈「网格大小」的空旷边距，自由放置时图块可拖到
  // 图片外部（避免过渡边界被切掉），贴齐网格模式仍在图片内吸附。
  const M = gridSize
  const worldW = baseW + 2 * M
  const worldH = baseH + 2 * M

  /** 槽位区域的左上角像素坐标：优先用对齐微调后的选框位置，否则自由坐标/网格格点 */
  function slotPixelPos(k: string): { x: number; y: number } | null {
    if (slotCropPos[k]) return slotCropPos[k]!
    const key = slots[k]
    if (!key) return null
    if (sliceFreePlace && modeBSlotFreePos[k]) return modeBSlotFreePos[k]!
    const [col, row] = key.split(",").map(Number)
    return { x: col * gridSize, y: row * gridSize }
  }

  /** 事件坐标 → 图像像素坐标（canvas 被整体 transform 缩放，按 rect 反算；允许越界返回负值/超出值） */
  function pixelFromEvent(e: { clientX: number; clientY: number }) {
    const canvas = overlayRef.current
    if (!canvas || !imageSize) return null
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    return {
      x: ((e.clientX - rect.left) / rect.width) * worldW - M,
      y: ((e.clientY - rect.top) / rect.height) * worldH - M,
    }
  }

  /** 命中检查：像素点落在哪个已绑定槽位的区域内 */
  function slotAtPixel(px: number, py: number): string | null {
    for (const k of slotKeys) {
      const p = slotPixelPos(k)
      if (p && px >= p.x && px < p.x + gridSize && py >= p.y && py < p.y + gridSize) return k
    }
    return null
  }

  /** 自由放置钳制：图块可拖到图片外部一圈（世界边距 M），不许越过世界范围 */
  function clampFreeImage(x: number, y: number) {
    return {
      x: Math.max(-M, Math.min(baseW - gridSize + M, x)),
      y: Math.max(-M, Math.min(baseH - gridSize + M, y)),
    }
  }

  // 网格覆盖层用单个 canvas 绘制，替代数千个 button DOM
  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current
    if (!canvas || !imageSize) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = worldW * dpr
    canvas.height = worldH * dpr
    canvas.style.width = `${worldW}px`
    canvas.style.height = `${worldH}px`
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, worldW, worldH)

    const drawSlotRect = (wx: number, wy: number, k: string, active: boolean) => {
      ctx.fillStyle = slotColors[k]
      ctx.fillRect(wx, wy, gridSize, gridSize)
      if (active) {
        ctx.strokeStyle = "rgba(255,255,255,0.95)"
        ctx.lineWidth = 2
        ctx.strokeRect(wx + 1, wy + 1, gridSize - 2, gridSize - 2)
      } else {
        ctx.strokeStyle = "rgba(255,255,255,0.4)"
        ctx.lineWidth = 1
        ctx.strokeRect(wx + 0.5, wy + 0.5, gridSize - 1, gridSize - 1)
      }
    }

    // 网格线 + 悬停高亮（shift 到图片世界偏移 M）
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const px = M + x * gridSize
        const py = M + y * gridSize
        ctx.strokeStyle = "rgba(255,255,255,0.08)"
        ctx.lineWidth = 1
        ctx.strokeRect(px + 0.5, py + 0.5, gridSize - 1, gridSize - 1)
        if (hoverCell && hoverCell.x === x && hoverCell.y === y) {
          ctx.fillStyle = "rgba(255,255,255,0.1)"
          ctx.fillRect(px, py, gridSize, gridSize)
        }
      }
    }
    // 已绑定槽位（自由放置用自由坐标，否则贴齐网格）
    for (const k of slotKeys) {
      const p = slotPixelPos(k)
      if (p) drawSlotRect(M + p.x, M + p.y, k, k === slot)
    }
    // 自由放置拖动中的实时位置
    if (liveFreePos) {
      drawSlotRect(M + liveFreePos.x, M + liveFreePos.y, liveFreePos.slot, true)
    }
  }, [gridSize, M, worldW, worldH, slot, hoverCell, imageSize, cols, rows, slotColors, slotKeys, slots, sliceFreePlace, modeBSlotFreePos, liveFreePos])

  useEffect(() => {
    drawOverlay()
  }, [drawOverlay])

  // React 合成 onWheel 是 passive 监听，无法 preventDefault；改用原生 wheel（passive:false）
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = stage.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const cx = rect.width / 2
      const cy = rect.height / 2
      setView((v) => {
        const nz = Math.max(0.25, Math.min(4, v.zoom - Math.sign(e.deltaY) * 0.1))
        const factor = nz / v.zoom
        return {
          zoom: nz,
          pan: {
            x: mx - cx - (mx - cx - v.pan.x) * factor,
            y: my - cy - (my - cy - v.pan.y) * factor,
          },
        }
      })
    }
    stage.addEventListener("wheel", onWheel, { passive: false })
    return () => stage.removeEventListener("wheel", onWheel)
  }, [image, imageSize])

  function cellFromEvent(e: { clientX: number; clientY: number }) {
    const canvas = overlayRef.current
    if (!canvas || !imageSize) return null
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    const ipx = ((e.clientX - rect.left) / rect.width) * worldW - M
    const ipy = ((e.clientY - rect.top) / rect.height) * worldH - M
    const cx = Math.floor(ipx / gridSize)
    const cy = Math.floor(ipy / gridSize)
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return null
    return { x: cx, y: cy }
  }

  return (
    <div
      className="relative h-full w-full"
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = "copy"
        setDragActive(true)
      }}
      onDragEnter={(e) => {
        e.preventDefault()
        setDragActive(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return
        setDragActive(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setDragActive(false)
        // 兼容 files 与 items 两种数据源
        const file = e.dataTransfer.files?.[0] ?? e.dataTransfer.items?.[0]?.getAsFile?.()
        if (file) handleDroppedFile(file)
      }}
    >
      {/* 拖拽悬停高亮提示 */}
      {dragActive && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center border-2 border-dashed border-primary bg-primary/10">
          <span className="rounded-md bg-background/80 px-3 py-1 text-sm text-foreground">松开以导入图片</span>
        </div>
      )}
      <div
        ref={stageRef}
        className="absolute inset-0 overflow-hidden bg-checkerboard"
        onPointerDown={(e) => {
          if (e.shiftKey || e.button === 1) {
            panning.current = true
            panStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
            e.currentTarget.setPointerCapture(e.pointerId)
          }
        }}
        onPointerMove={(e) => {
          if (!panning.current) return
          setView((v) => ({
            ...v,
            pan: {
              x: panStart.current.px + (e.clientX - panStart.current.x),
              y: panStart.current.py + (e.clientY - panStart.current.y),
            },
          }))
        }}
        onPointerUp={(e) => {
          panning.current = false
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
        }}
        onPointerLeave={() => {
          panning.current = false
        }}
      >
        {!image || !imageSize ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2">
            <p className="px-4 text-center text-xs text-muted-foreground">尚未导入图片 — 点击上方「更换图片」</p>
          </div>
        ) : (
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              width: worldW,
              height: worldH,
              transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
              transformOrigin: "center center",
              imageRendering: "pixelated",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt="导入的纹理图片"
              className="absolute"
              style={{ left: M, top: M, width: baseW, height: baseH, imageRendering: "pixelated" }}
              draggable={false}
            />
            <canvas
              ref={overlayRef}
              aria-label="网格点选画布"
              className="absolute inset-0 touch-none"
              style={{ imageRendering: "pixelated" }}
              onPointerDown={(e) => {
                if (e.shiftKey || e.button === 1) return
                if (sliceFreePlace) {
                  const p = pixelFromEvent(e)
                  if (!p) return
                  // 命中已绑定槽位则改拖它；否则放置当前选中槽位
                  const hit = slotAtPixel(p.x, p.y)
                  const target = hit ?? slot
                  if (hit) setSlot(hit)
                  const { x, y } = clampFreeImage(p.x, p.y)
                  freeDragRef.current = { slot: target, x, y }
                  setLiveFreePos({ slot: target, x, y })
                  e.currentTarget.setPointerCapture(e.pointerId)
                } else {
                  const c = cellFromEvent(e)
                  if (c) assignCell(slot, `${c.x},${c.y}`)
                }
              }}
              onPointerMove={(e) => {
                if (panning.current) return
                if (freeDragRef.current) {
                  const p = pixelFromEvent(e)
                  if (p) {
                    const { x, y } = clampFreeImage(p.x, p.y)
                    freeDragRef.current = { ...freeDragRef.current, x, y }
                    setLiveFreePos({ slot: freeDragRef.current.slot, x, y })
                  }
                  return
                }
                const c = cellFromEvent(e)
                setHoverCell((prev) => {
                  if (!c) return null
                  if (prev && prev.x === c.x && prev.y === c.y) return prev
                  return c
                })
              }}
              onPointerUp={(e) => {
                if (freeDragRef.current) {
                  const d = freeDragRef.current
                  freeDragRef.current = null
                  setLiveFreePos(null)
                  assignModeBSlotFree(d.slot, d.x, d.y)
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
                }
              }}
              onPointerLeave={() => {
                setHoverCell(null)
                freeDragRef.current = null
                setLiveFreePos(null)
              }}
            />
          </div>
        )}
      </div>

      {/* 右上角缩放控制 */}
      <div className="absolute right-2 top-2 flex items-center gap-1 rounded-md border border-border bg-background/80 p-1 backdrop-blur">
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => setView((v) => ({ ...v, zoom: Math.max(0.25, v.zoom - 0.25) }))}
          aria-label="缩小"
        >
          <ZoomOut className="size-3.5" />
        </Button>
        <span className="w-9 text-center font-mono text-[11px] text-muted-foreground">{Math.round(zoom * 100)}%</span>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => setView((v) => ({ ...v, zoom: Math.min(4, v.zoom + 0.25) }))}
          aria-label="放大"
        >
          <ZoomIn className="size-3.5" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => setView({ zoom: 1, pan: { x: 0, y: 0 } })}
          aria-label="重置视图"
        >
          <Maximize className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}