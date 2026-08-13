"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useEditorStore } from "@/lib/store"
import {
  SLOT_COLORS,
  SLOT_LABELS,
  SLOT_ORDER,
  DUAL16_COLORS,
  DUAL16_LABELS,
  DUAL16_SLOT_KEYS,
  BLOB5_COLORS,
  BLOB5_LABELS,
  BLOB5_SLOT_KEYS,
} from "@/lib/quadrant-stitch"
import { Upload, ZoomIn, ZoomOut, Maximize } from "lucide-react"
import { Button } from "@/components/ui/button"

export function ModeBGridView() {
  const image = useEditorStore((s) => s.modeBImage)
  const imageSize = useEditorStore((s) => s.modeBImageSize)
  const gridSize = useEditorStore((s) => s.modeBGridSize)
  const slot = useEditorStore((s) => s.modeBSlot)
  const slots = useEditorStore((s) => s.modeBSlots)
  const assignCell = useEditorStore((s) => s.assignModeBCell)
  const mappingType = useEditorStore((s) => s.mappingType)

  const simplified = useEditorStore((s) => s.blob47Simplified)
  const isDual16 = mappingType === "16"
  const isSimple47 = !isDual16 && simplified
  const slotKeys: string[] = isDual16
    ? DUAL16_SLOT_KEYS
    : isSimple47
      ? BLOB5_SLOT_KEYS
      : SLOT_ORDER
  const slotColors: Record<string, string> = isDual16
    ? DUAL16_COLORS
    : isSimple47
      ? BLOB5_COLORS
      : SLOT_COLORS
  const slotLabels: Record<string, string> = isDual16
    ? DUAL16_LABELS
    : isSimple47
      ? BLOB5_LABELS
      : SLOT_LABELS

  const [view, setView] = useState({ zoom: 1, pan: { x: 0, y: 0 } })
  const { zoom, pan } = view
  const panning = useRef(false)
  const panStart = useRef({ x: 0, y: 0, px: 0, py: 0 })
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)

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

  // 网格覆盖层用单个 canvas 绘制，替代数千个 button DOM：
  // 切换映射表/切片大小时仅重绘，不再重建 DOM 节点
  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current
    if (!canvas || !imageSize) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = baseW * dpr
    canvas.height = baseH * dpr
    canvas.style.width = `${baseW}px`
    canvas.style.height = `${baseH}px`
    const ctx = canvas.getContext("2d")
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
  }, [slotOfKey, gridSize, slot, hoverCell, imageSize, cols, rows, baseW, baseH])

  useEffect(() => {
    drawOverlay()
  }, [drawOverlay])

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

  if (!image || !imageSize) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-checkerboard">
        <Upload className="size-6 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">在左侧面板导入图片以开始网格点选</p>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-sidebar px-4 py-2">
        <span className="text-xs font-medium text-foreground">网格点选</span>
        <span
          className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] text-foreground"
          style={{ backgroundColor: slotColors[slot] }}
        >
          <span className="size-2 rounded-[2px] bg-white/80" />
          正在绑定：{slotLabels[slot]}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" onClick={() => setView((v) => ({ ...v, zoom: Math.max(0.25, v.zoom - 0.25) }))} aria-label="缩小">
            <ZoomOut className="size-4" />
          </Button>
          <span className="w-12 text-center font-mono text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <Button size="icon-sm" variant="ghost" onClick={() => setView((v) => ({ ...v, zoom: Math.min(4, v.zoom + 0.25) }))} aria-label="放大">
            <ZoomIn className="size-4" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setView({ zoom: 1, pan: { x: 0, y: 0 } })}
            aria-label="重置视图"
          >
            <Maximize className="size-4" />
          </Button>
        </div>
      </div>

      <div
        className="relative flex-1 overflow-hidden bg-checkerboard"
        style={{ cursor: "default" }}
        onWheel={(e) => {
          // 鼠标滚轮缩放，以鼠标位置为中心
          e.preventDefault()
          const rect = e.currentTarget.getBoundingClientRect()
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
        }}
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
            src={image || "/placeholder.svg"}
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
      </div>
    </div>
  )
}
