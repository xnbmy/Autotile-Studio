"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
  const setImage = useEditorStore((s) => s.setModeBImage)
  const setSlot = useEditorStore((s) => s.setModeBSlot)
  const mappingType = useEditorStore((s) => s.mappingType)

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

  // 反向映射：源图格子 -> 已绑定槽位（O(1) 查找）
  const slotOfKey = useMemo(() => {
    const m = new Map<string, string>()
    for (const k of slotKeys) {
      const key = slots[k]
      if (key) m.set(key, k)
    }
    return m
  }, [slots, slotKeys])

  const cols = imageSize ? Math.floor(imageSize.w / gridSize) : 0
  const rows = imageSize ? Math.floor(imageSize.h / gridSize) : 0
  const baseW = cols * gridSize
  const baseH = rows * gridSize

  // 网格覆盖层用单个 canvas 绘制，替代数千个 button DOM
  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current
    if (!canvas || !imageSize) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = baseW * dpr
    canvas.height = baseH * dpr
    canvas.style.width = `${baseW}px`
    canvas.style.height = `${baseH}px`
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, baseW, baseH)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const key = `${x},${y}`
        const px = x * gridSize
        const py = y * gridSize
        const bound = slotOfKey.get(key)
        if (bound) {
          ctx.fillStyle = slotColors[bound]
          ctx.fillRect(px, py, gridSize, gridSize)
          if (bound === slot) {
            ctx.strokeStyle = "rgba(255,255,255,0.95)"
            ctx.lineWidth = 2
            ctx.strokeRect(px + 1, py + 1, gridSize - 2, gridSize - 2)
          } else {
            ctx.strokeStyle = "rgba(255,255,255,0.4)"
            ctx.lineWidth = 1
            ctx.strokeRect(px + 0.5, py + 0.5, gridSize - 1, gridSize - 1)
          }
        } else {
          ctx.strokeStyle = "rgba(255,255,255,0.1)"
          ctx.lineWidth = 1
          ctx.strokeRect(px + 0.5, py + 0.5, gridSize - 1, gridSize - 1)
        }
        if (hoverCell && hoverCell.x === x && hoverCell.y === y) {
          ctx.fillStyle = "rgba(255,255,255,0.1)"
          ctx.fillRect(px, py, gridSize, gridSize)
        }
      }
    }
  }, [slotOfKey, gridSize, slot, hoverCell, imageSize, cols, rows, baseW, baseH, slotColors])

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
    const cx = Math.floor(((e.clientX - rect.left) / rect.width) * cols)
    const cy = Math.floor(((e.clientY - rect.top) / rect.height) * rows)
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
              width: baseW,
              height: baseH,
              transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
              transformOrigin: "center center",
              imageRendering: "pixelated",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt="导入的纹理图片"
              className="absolute inset-0 h-full w-full"
              style={{ imageRendering: "pixelated" }}
              draggable={false}
            />
            <canvas
              ref={overlayRef}
              aria-label="网格点选画布"
              className="absolute inset-0 touch-none"
              style={{ imageRendering: "pixelated" }}
              onPointerDown={(e) => {
                if (e.shiftKey || e.button === 1) return
                const c = cellFromEvent(e)
                if (c) assignCell(slot, `${c.x},${c.y}`)
              }}
              onPointerMove={(e) => {
                if (panning.current) return
                const c = cellFromEvent(e)
                setHoverCell((prev) => {
                  if (!c) return null
                  if (prev && prev.x === c.x && prev.y === c.y) return prev
                  return c
                })
              }}
              onPointerLeave={() => setHoverCell(null)}
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