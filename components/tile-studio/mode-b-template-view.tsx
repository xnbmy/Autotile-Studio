"use client"

import { useEffect, useRef, useState } from "react"
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
import { Button } from "@/components/ui/button"
import { ArrowLeft, Grid3x3, Minus, Plus, ZoomIn } from "lucide-react"

export function ModeBTemplateView({ onBack }: { onBack: () => void }) {
  const result = useEditorStore((s) => s.modeBResult)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(1)
  const [zoom, setZoom] = useState(1)

  // 同步 zoom 到 ref，供滚轮事件读取最新值
  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  // 鼠标滚轮缩放（以鼠标位置为中心），用原生非被动监听阻止容器滚动
  useEffect(() => {
    const sc = scrollRef.current
    if (!sc) return
    function onWheel(e: WheelEvent) {
      if (!result) return
      const el = scrollRef.current
      if (!el) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left + el.scrollLeft
      const my = e.clientY - rect.top + el.scrollTop
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      const next = Math.min(16, Math.max(0.125, zoomRef.current * factor))
      const snapped = Math.round(next * 1000) / 1000
      if (snapped === zoomRef.current) return
      // 以光标为锚点缩放：保持光标在内容中的像素位置不变
      const ratio = snapped / zoomRef.current
      el.scrollLeft = mx * ratio - (e.clientX - rect.left)
      el.scrollTop = my * ratio - (e.clientY - rect.top)
      setZoom(snapped)
    }
    sc.addEventListener("wheel", onWheel, { passive: false })
    return () => sc.removeEventListener("wheel", onWheel)
  }, [result])

  // 重绘：位图尺寸 = 结果尺寸按当前 zoom 取整，再用最近邻重绘。
  // 这样位图像素与 CSS 像素 1:1，避免「整数位图被 CSS 缩放到非整数尺寸」时
  // 瓦片边界的亚像素插值缝隙（导出 PNG 按整数网格拼合，所以导出无此问题）。
  useEffect(() => {
    const el = canvasRef.current
    if (!el || !result) return
    const z = zoomRef.current
    const bw = Math.max(1, Math.round(result.width * z))
    const bh = Math.max(1, Math.round(result.height * z))
    el.width = bw
    el.height = bh
    const ctx = el.getContext("2d")
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, el.width, el.height)
    ctx.drawImage(result.canvas, 0, 0, result.width, result.height, 0, 0, bw, bh)
  }, [result, zoom])

  // 切换模板时重置缩放
  useEffect(() => {
    setZoom(1)
  }, [result])

  if (!result) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-checkerboard">
        <Grid3x3 className="size-6 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">在左侧面板导入图片、绑定槽位并点击“生成模板”</p>
      </div>
    )
  }

  // 槽位 chip 的键/标签/颜色：从结果自身的槽键推断所用槽集，
  // 这样即使之后切换了简化开关，已生成的旧模板仍能正确显示。
  const slotChips: {
    keys: string[]
    labels: Record<string, string>
    colors: Record<string, string>
  } =
    result.mappingType === "16"
      ? { keys: DUAL16_SLOT_KEYS, labels: DUAL16_LABELS, colors: DUAL16_COLORS }
      : BLOB5_SLOT_KEYS.every((k) => k in result.slots)
        ? { keys: BLOB5_SLOT_KEYS, labels: BLOB5_LABELS, colors: BLOB5_COLORS }
        : { keys: SLOT_ORDER, labels: SLOT_LABELS, colors: SLOT_COLORS }

  function stepZoom(dir: 1 | -1) {
    setZoom((z) => {
      const next = dir === 1 ? z * 1.25 : z / 1.25
      return Math.min(16, Math.max(0.125, Math.round(next * 1000) / 1000))
    })
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-sidebar px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">五块切片模板</span>
          <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
            {result.mappingType === "47" ? "47-tile" : "16-tile"} · {result.tiles.size} 图块 · {result.tileSize}px
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {slotChips.keys.map((k) =>
            result.slots[k] ? (
              <span key={k} className="flex items-center gap-1.5 rounded-full bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                <span
                  className="size-2 rounded-[2px]"
                  style={{ backgroundColor: slotChips.colors[k] }}
                />
                {slotChips.labels[k]}
              </span>
            ) : null,
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-border bg-background px-1 py-0.5">
            <Button size="icon" variant="ghost" className="size-6" onClick={() => stepZoom(-1)} title="缩小">
              <Minus className="size-3.5" />
            </Button>
            <span className="w-12 text-center font-mono text-[11px] tabular-nums text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
            <Button size="icon" variant="ghost" className="size-6" onClick={() => stepZoom(1)} title="放大">
              <Plus className="size-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="size-6" onClick={() => setZoom(1)} title="适应 / 100%">
              <ZoomIn className="size-3.5" />
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={onBack}>
            <ArrowLeft data-icon="inline-start" />
            返回点选
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="flex flex-1 items-start justify-center overflow-auto bg-checkerboard p-6">
        <div className="flex flex-col items-center gap-3">
          <div
            className="relative shrink-0 rounded-sm shadow-sm ring-1 ring-border"
            style={{ width: Math.round(result.width * zoom), height: Math.round(result.height * zoom) }}
          >
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full rounded-sm"
              style={{ imageRendering: "pixelated" }}
            />
            {/* 网格线叠加，便于检查瓦片边界对齐 */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.12) 1px, transparent 1px)",
                backgroundSize: `${Math.round(result.tileSize * zoom)}px ${Math.round(result.tileSize * zoom)}px`,
              }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            网格 {result.columns}×{result.rows} · 共 {result.tiles.size} 个图块 · 缩放 {Math.round(zoom * 100)}%
            {result.mappingType === "47" ? "（Blob 8-bit 标准排列）" : "（4-bit 标准排列）"}。
          </p>
        </div>
      </div>
    </div>
  )
}
