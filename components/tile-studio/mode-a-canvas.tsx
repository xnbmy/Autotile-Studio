"use client"

import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useEditorStore } from "@/lib/store"
import { generateTileAsset } from "@/lib/asset-factory"
import { encodeBlob47 } from "@/lib/tile-mapping"
import { lineCells, circleCells } from "@/lib/canvas-geometry"
import { Button } from "@/components/ui/button"
import { Brush, Circle, Eraser, Hand, PaintBucket, Slash, Trash2 } from "lucide-react"

type Tool = "brush" | "eraser" | "fill" | "line" | "circle" | "pan"

const TOOLS: { value: Tool; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "brush", label: "画笔", icon: Brush },
  { value: "eraser", label: "橡皮", icon: Eraser },
  { value: "fill", label: "填充", icon: PaintBucket },
  { value: "line", label: "直线", icon: Slash },
  { value: "circle", label: "圆形", icon: Circle },
  { value: "pan", label: "平移", icon: Hand },
]

function neighborMaskForAutotile(cells: Set<string>, x: number, y: number, mappingType: "16" | "47") {
  const has = (dx: number, dy: number) => cells.has(`${x + dx},${y + dy}`)
  if (mappingType === "16") {
    // 双网格角掩码（B 位约定，与派生/导出瓦片一致）：TL=8, TR=4, BL=2, BR=1
    return (
      (has(-1, -1) ? 8 : 0) |
      (has(0, -1) ? 4 : 0) |
      (has(-1, 0) ? 2 : 0) |
      (has(0, 0) ? 1 : 0)
    )
  }
  return encodeBlob47({
    n: has(0, -1),
    ne: has(1, -1),
    e: has(1, 0),
    se: has(1, 1),
    s: has(0, 1),
    sw: has(-1, 1),
    w: has(-1, 0),
    nw: has(-1, -1),
  })
}

export function ModeACanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const genParams = useEditorStore((s) => s.genParams)
  const mappingType = useEditorStore((s) => s.mappingType)
  const tileSize = useEditorStore((s) => s.tileSize)
  const gridW = useEditorStore((s) => s.gridW)
  const gridH = useEditorStore((s) => s.gridH)

  const [tool, setTool] = useState<Tool>("brush")
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 24, y: 24 })
  const [cells, setCells] = useState<Set<string>>(new Set())
  const [isDrawing, setIsDrawing] = useState(false)
  const [dragStart, setDragStart] = useState<[number, number] | null>(null)
  const [panning, setPanning] = useState<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
  const eraseMode = useRef(false)

  // 用当前参数实时生成图块（参数变化后延迟 250ms 重建，避免拖动滑块卡顿）
  const [asset, setAsset] = useState<ReturnType<typeof generateTileAsset> | null>(null)
  useEffect(() => {
    const t = setTimeout(() => {
      setAsset(generateTileAsset("程序生成纹理", mappingType, tileSize, genParams))
    }, 250)
    return () => clearTimeout(t)
  }, [genParams, mappingType, tileSize])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const width = wrapRef.current?.clientWidth ?? 800
    const height = wrapRef.current?.clientHeight ?? 600
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, width, height)

    ctx.save()
    ctx.translate(pan.x, pan.y)
    ctx.scale(zoom, zoom)

    // 透明格子背景由容器 bg-checkerboard 铺满视口，此处仅绘制世界网格内容

    if (asset) {
      // 相邻瓦片重叠 1 个世界像素绘制，盖住非整数倍缩放时接缝处的亚像素缝隙
      // （导出 PNG 无此问题，是因为导出按整数网格拼合；屏幕缩放需主动消除插值缝）。
      const over = 1 / zoom
      if (mappingType === "16") {
        // 双网格角掩码：瓦片落在世界格子的「角」上，而非格子中心。
        // 因此绘制位置需偏移半格(-tileSize/2)，使瓦片中心对齐世界格角，
        // 与 mode-b-test-map 的 16 模式几何一致（否则图块会偏右下半格）。
        const half = tileSize / 2
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
        for (const key of cells) {
          const [x, y] = key.split(",").map(Number)
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
        if (minX !== Infinity) {
          for (let y = minY - 1; y <= maxY + 1; y++) {
            for (let x = minX - 1; x <= maxX + 1; x++) {
              const mask = neighborMaskForAutotile(cells, x, y, mappingType)
              if (mask === 0) continue
              const tileCanvas = asset.tiles.get(mask)
              if (tileCanvas)
                ctx.drawImage(tileCanvas, x * tileSize - half, y * tileSize - half, tileSize + over, tileSize + over)
            }
          }
        }
      } else {
        for (const key of cells) {
          const [x, y] = key.split(",").map(Number)
          const mask = neighborMaskForAutotile(cells, x, y, mappingType)
          const tileCanvas = asset.tiles.get(mask)
          if (tileCanvas)
            ctx.drawImage(tileCanvas, x * tileSize, y * tileSize, tileSize + over, tileSize + over)
        }
      }
    }

    ctx.strokeStyle = "rgba(255,255,255,0.06)"
    ctx.lineWidth = 1 / zoom
    for (let gx = 0; gx <= gridW; gx++) {
      ctx.beginPath()
      ctx.moveTo(gx * tileSize, 0)
      ctx.lineTo(gx * tileSize, gridH * tileSize)
      ctx.stroke()
    }
    for (let gy = 0; gy <= gridH; gy++) {
      ctx.beginPath()
      ctx.moveTo(0, gy * tileSize)
      ctx.lineTo(gridW * tileSize, gy * tileSize)
      ctx.stroke()
    }

    // 可绘制区域边界框（更明显）
    ctx.strokeStyle = "rgba(226,232,240,0.55)"
    ctx.lineWidth = 2 / zoom
    ctx.strokeRect(-1, -1, gridW * tileSize + 2, gridH * tileSize + 2)

    ctx.restore()
  }, [cells, asset, mappingType, tileSize, gridW, gridH, zoom, pan])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    const handleResize = () => draw()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [draw])

  function toGrid(clientX: number, clientY: number): [number, number] | null {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return null
    const localX = (clientX - rect.left - pan.x) / zoom
    const localY = (clientY - rect.top - pan.y) / zoom
    const gx = Math.floor(localX / tileSize)
    const gy = Math.floor(localY / tileSize)
    if (gx < 0 || gy < 0 || gx >= gridW || gy >= gridH) return null
    return [gx, gy]
  }

  function applyStroke(cellsXY: [number, number][], erase: boolean) {
    setCells((prev) => {
      const next = new Set(prev)
      for (const [x, y] of cellsXY) {
        const key = `${x},${y}`
        if (erase) next.delete(key)
        else next.add(key)
      }
      return next
    })
  }

  function floodFill(x: number, y: number, erase: boolean) {
    setCells((prev) => {
      const next = new Set(prev)
      const startKey = `${x},${y}`
      const target = prev.has(startKey)
      if (erase ? !target : target) return next
      const stack = [startKey]
      const seen = new Set<string>()
      while (stack.length) {
        const key = stack.pop()!
        if (seen.has(key)) continue
        seen.add(key)
        if (erase) next.delete(key)
        else next.add(key)
        const [cx, cy] = key.split(",").map(Number)
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) continue
          const nk = `${nx},${ny}`
          if (seen.has(nk)) continue
          const hasVal = prev.has(nk)
          if (erase ? hasVal : !hasVal) stack.push(nk)
        }
      }
      return next
    })
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (tool === "pan" || e.button === 1) {
      setPanning({ startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y })
      return
    }
    const grid = toGrid(e.clientX, e.clientY)
    if (!grid) return
    const erase = tool === "eraser" || e.button === 2
    eraseMode.current = erase

    if (tool === "fill") {
      floodFill(grid[0], grid[1], erase)
      return
    }
    if (tool === "brush" || tool === "eraser") {
      applyStroke([grid], erase)
    }
    setDragStart(grid)
    setIsDrawing(true)
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (panning) {
      setPan({ x: panning.panX + (e.clientX - panning.startX), y: panning.panY + (e.clientY - panning.startY) })
      return
    }
    if (!isDrawing) return
    const grid = toGrid(e.clientX, e.clientY)
    if (!grid) return
    if (tool === "brush" || tool === "eraser") {
      applyStroke([grid], eraseMode.current)
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (panning) {
      setPanning(null)
      return
    }
    if (!isDrawing || !dragStart) {
      setIsDrawing(false)
      return
    }
    const grid = toGrid(e.clientX, e.clientY)
    if (grid) {
      if (tool === "line") applyStroke(lineCells(dragStart[0], dragStart[1], grid[0], grid[1]), eraseMode.current)
      if (tool === "circle") {
        const r = Math.round(Math.hypot(grid[0] - dragStart[0], grid[1] - dragStart[1]))
        applyStroke(circleCells(dragStart[0], dragStart[1], r), eraseMode.current)
      }
    }
    setIsDrawing(false)
    setDragStart(null)
  }

  // React 合成 onWheel 在 React 19 中是 passive 监听，无法 preventDefault；
  // 改用原生 wheel 事件（passive:false），与其它画布组件一致
  const wheelRef = useRef((e: WheelEvent) => {})
  wheelRef.current = (e: WheelEvent) => {
    e.preventDefault()
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    const newZoom = Math.max(0.25, Math.min(4, zoom + delta))
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const worldX = (mx - pan.x) / zoom
    const worldY = (my - pan.y) / zoom
    setZoom(newZoom)
    setPan({ x: mx - worldX * newZoom, y: my - worldY * newZoom })
  }
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const handler = (e: WheelEvent) => wheelRef.current(e)
    el.addEventListener("wheel", handler, { passive: false })
    return () => el.removeEventListener("wheel", handler)
  }, [])

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full touch-none overflow-hidden bg-checkerboard"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ cursor: tool === "pan" ? "grab" : "crosshair" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onContextMenu={(e) => e.preventDefault()}
      />

      <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-border bg-popover/90 p-1 shadow-sm backdrop-blur">
        {TOOLS.map((t) => (
          <Button
            key={t.value}
            size="icon-sm"
            variant={tool === t.value ? "default" : "ghost"}
            onClick={() => setTool(t.value)}
            aria-label={t.label}
            title={t.label}
          >
            <t.icon className="size-4" />
          </Button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        <Button size="icon-sm" variant="ghost" onClick={() => setCells(new Set())} aria-label="清空" title="清空">
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div className="absolute bottom-3 right-3 z-10 rounded-md border border-border bg-popover/90 px-2 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
        {Math.round(zoom * 100)}% · 画布 {gridW}×{gridH}
      </div>
    </div>
  )
}
