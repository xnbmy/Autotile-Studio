"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useEditorStore } from "@/lib/store"
import { encodeBlob47 } from "@/lib/tile-mapping"
import { Button } from "@/components/ui/button"
import { ChevronLeft, Eraser, Paintbrush, Grid3x3, Square } from "lucide-react"
import { toast } from "sonner"

const MAP_W = 40
const MAP_H = 24

// 测试图案：返回一组被填充的格子坐标
function loadPattern(kind: "blob" | "path" | "pond" | "island"): Set<string> {
  const cells = new Set<string>()
  const set = (x: number, y: number) => cells.add(`${x},${y}`)
  if (kind === "blob") {
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) set(x, y)
  } else if (kind === "island") {
    const cx = MAP_W / 2
    const cy = MAP_H / 2
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        if (Math.hypot(x - cx, y - cy) < Math.min(MAP_W, MAP_H) / 2 - 2) set(x, y)
      }
  } else if (kind === "pond") {
    const cx = MAP_W / 2
    const cy = MAP_H / 2
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        if (Math.hypot(x - cx, y - cy) < 6) set(x, y)
      }
  } else {
    // path: 一条蜿蜒的路
    for (let x = 0; x < MAP_W; x++) {
      const y = Math.floor(MAP_H / 2 + Math.sin(x / 3) * 4)
      set(x, y)
      set(x, y + 1)
    }
  }
  return cells
}

export function ModeBTestMap({ onBack, embedded = false }: { onBack: () => void; embedded?: boolean }) {
  const result = useEditorStore((s) => s.modeBResult)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [cells, setCells] = useState<Set<string>>(new Set())
  const [isDrawing, setIsDrawing] = useState(false)
  const eraseRef = useRef(false)
  const [view, setView] = useState({ zoom: 1, pan: { x: 0, y: 0 } })
  const { zoom, pan } = view
  const panning = useRef(false)
  const panStart = useRef({ x: 0, y: 0, px: 0, py: 0 })
  const interactedRef = useRef(false)

  const tileSize = result?.tileSize ?? 32

  const isDual16 = result?.mappingType === "16"

  // 自动适配视图：让整张地图完整居中显示
  const fitView = useCallback(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const w = wrap.clientWidth
    const h = wrap.clientHeight
    if (w <= 0 || h <= 0) return
    const tsize = result?.tileSize ?? 32
    const contentW = MAP_W * tsize + tsize / 2
    const contentH = MAP_H * tsize + tsize / 2
    const z = Math.max(0.25, Math.min(1, (w - 24) / contentW, (h - 24) / contentH))
    setView({
      zoom: z,
      pan: {
        x: Math.round((w - contentW * z) / 2),
        y: Math.round((h - contentH * z) / 2),
      },
    })
  }, [result?.tileSize])

  // 初始 / 容器尺寸变化时自动适配；一旦用户手动缩放或拖拽后不再覆盖
  useEffect(() => {
    if (interactedRef.current) return
    fitView()
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => {
      if (!interactedRef.current) fitView()
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [fitView, result])

  // 鼠标滚轮缩放，以鼠标位置为中心。
  // 用原生非被动 wheel 监听，保证 preventDefault 生效（合成事件默认 passive）
  const wheelHandlerRef = useRef<(e: WheelEvent) => void>(() => {})
  wheelHandlerRef.current = (e: WheelEvent) => {
    e.preventDefault()
    interactedRef.current = true
    const wrap = wrapRef.current
    if (!wrap) return
    const rect = wrap.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    setView((v) => {
      const nz = Math.max(0.25, Math.min(4, v.zoom - Math.sign(e.deltaY) * 0.1))
      const factor = nz / v.zoom
      return {
        zoom: nz,
        pan: {
          x: mx - (mx - v.pan.x) * factor,
          y: my - (my - v.pan.y) * factor,
        },
      }
    })
  }
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const handler = (e: WheelEvent) => wheelHandlerRef.current(e)
    wrap.addEventListener("wheel", handler, { passive: false })
    return () => wrap.removeEventListener("wheel", handler)
  }, [result])

  const getMask = useCallback(
    (x: number, y: number): number => {
      const has = (dx: number, dy: number) => cells.has(`${x + dx},${y + dy}`)
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
    },
    [cells],
  )

  // Dual-grid: the display tile at (x, y) is offset half a tile from the world
  // grid and samples the 4 world cells surrounding its corners.
  //   TL = (x-1, y-1), TR = (x, y-1), BL = (x-1, y), BR = (x, y)
  const getDualMask = useCallback(
    (x: number, y: number): number => {
      const has = (cx: number, cy: number) => (cells.has(`${cx},${cy}`) ? 1 : 0)
      return (
        (has(x - 1, y - 1) << 3) | (has(x, y - 1) << 2) | (has(x - 1, y) << 1) | has(x, y)
      )
    },
    [cells],
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !result) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const width = wrapRef.current?.clientWidth ?? 800
    const height = wrapRef.current?.clientHeight ?? 600
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    // 直接在设备像素空间绘制：所有坐标 Math.round 到整数设备像素，
    // 避免 dpr（如 1.5/1.25）或 zoom 为非整数时 drawImage 落在亚像素边界，
    // 浏览器用透明度填充相邻 tile 间缝隙（导出模板无此问题是因为它按整数网格拼合）。
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const tsize = Math.max(1, Math.ceil(tileSize * zoom * dpr))
    // 相邻瓦片重叠 1 设备像素绘制，盖住非整数倍缩放时接缝处的亚像素缝隙
    const toScreen = (gx: number, gy: number) => {
      const sx = (pan.x + gx * zoom) * dpr
      const sy = (pan.y + gy * zoom) * dpr
      return [Math.round(sx), Math.round(sy)] as const
    }
    const toSize = tsize + 1
    if (isDual16) {
      // Display grid is one larger in each axis and shifted by half a tile.
      const half = tileSize / 2
      for (let y = 0; y <= MAP_H; y++) {
        for (let x = 0; x <= MAP_W; x++) {
          const mask = getDualMask(x, y)
          if (mask === 0) continue
          const tile = result.tiles.get(mask)
          if (tile) {
            const [sx, sy] = toScreen(x * tileSize - half, y * tileSize - half)
            ctx.drawImage(tile, sx, sy, toSize, toSize)
          }
        }
      }
    } else {
      for (let y = 0; y < MAP_H; y++) {
        for (let x = 0; x < MAP_W; x++) {
          if (!cells.has(`${x},${y}`)) continue
          const mask = getMask(x, y)
          const tile = result.tiles.get(mask)
          if (tile) {
            const [sx, sy] = toScreen(x * tileSize, y * tileSize)
            ctx.drawImage(tile, sx, sy, toSize, toSize)
          }
        }
      }
    }
  }, [result, cells, tileSize, zoom, pan, isDual16, getMask, getDualMask])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    const h = () => draw()
    window.addEventListener("resize", h)
    return () => window.removeEventListener("resize", h)
  }, [draw])

  if (!result) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-checkerboard">
        <Grid3x3 className="size-6 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">请先在左侧生成模板，再回到此页测试拼合效果</p>
        {!embedded && (
          <Button size="sm" variant="ghost" onClick={onBack}>
            <ChevronLeft data-icon="inline-start" /> 返回点选
          </Button>
        )}
      </div>
    )
  }

  function toGrid(clientX: number, clientY: number): [number, number] | null {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return null
    const lx = (clientX - rect.left - pan.x) / zoom
    const ly = (clientY - rect.top - pan.y) / zoom
    const gx = Math.floor(lx / tileSize)
    const gy = Math.floor(ly / tileSize)
    if (gx < 0 || gy < 0 || gx >= MAP_W || gy >= MAP_H) return null
    return [gx, gy]
  }

  function paint(gx: number, gy: number, erase: boolean) {
    setCells((prev) => {
      const next = new Set(prev)
      const key = `${gx},${gy}`
      if (erase) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-sidebar px-4 py-2.5">
        <span className="text-xs font-medium text-foreground">测试地图</span>
        <span className="text-[11px] text-muted-foreground">左键涂 · 右键擦 · 中键拖动画布</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setCells(loadPattern("island"))}>
            <Square data-icon="inline-start" /> 岛屿
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCells(loadPattern("pond"))}>
            水塘
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCells(loadPattern("path"))}>
            小径
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCells(loadPattern("blob"))}>
            满屏
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCells(new Set())}>
            <Eraser data-icon="inline-start" /> 清空
          </Button>
          {!embedded && (
            <Button size="sm" variant="ghost" onClick={onBack}>
              <ChevronLeft data-icon="inline-start" /> 返回
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" onClick={() => setView((v) => ({ ...v, zoom: Math.max(0.25, v.zoom - 0.25) }))}>
            −
          </Button>
          <span className="w-10 text-center font-mono text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <Button size="icon-sm" variant="ghost" onClick={() => setView((v) => ({ ...v, zoom: Math.min(4, v.zoom + 0.25) }))}>
            +
          </Button>
        </div>
      </div>

      <div
        ref={wrapRef}
        className="relative flex-1 overflow-hidden bg-checkerboard"
        style={{ cursor: isDrawing ? "crosshair" : "default" }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 touch-none"
          onPointerDown={(e) => {
            // 中键：移动画布
            if (e.button === 1) {
              interactedRef.current = true
              panning.current = true
              panStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
              e.currentTarget.setPointerCapture(e.pointerId)
              return
            }
            // 左键绘制，右键删除
            if (e.button !== 0 && e.button !== 2) return
            const erase = e.button === 2
            eraseRef.current = erase
            setIsDrawing(true)
            const g = toGrid(e.clientX, e.clientY)
            if (g) paint(g[0], g[1], erase)
          }}
          onPointerMove={(e) => {
            if (panning.current) {
              setView((v) => ({
                ...v,
                pan: {
                  x: panStart.current.px + (e.clientX - panStart.current.x),
                  y: panStart.current.py + (e.clientY - panStart.current.y),
                },
              }))
              return
            }
            if (!isDrawing) return
            const g = toGrid(e.clientX, e.clientY)
            if (g) paint(g[0], g[1], eraseRef.current)
          }}
          onPointerUp={(e) => {
            setIsDrawing(false)
            panning.current = false
            if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
          }}
          onPointerLeave={() => {
            setIsDrawing(false)
            panning.current = false
          }}
        />
      </div>

      <div className="flex items-center gap-2 border-t border-border bg-sidebar px-4 py-1.5 text-[11px] text-muted-foreground">
        <Paintbrush className="size-3" /> 共填充 {cells.size} 格 · 实时按 8 邻居掩码拼合，验证外角/内角/边缘是否衔接自然
      </div>
    </div>
  )
}
