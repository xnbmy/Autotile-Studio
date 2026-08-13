"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useEditorStore } from "@/lib/store"
import { deriveTilesFromBase, MASK16_FULL, MASK47_FULL } from "@/lib/quadrant-stitch"
import { encodeBlob47 } from "@/lib/tile-mapping"

/* ─────────────────────────────────────────────────────────────
 * P2.6 底部全局测试区（draw 来源）：涂抹一张 48×12 地图，
 * 每格按 8 邻居算 mask，从实时派生瓦片取图渲染 —— 改一个像素，全图联动。
 *
 * 交互：
 *  - 左键：涂抹 / 擦除（brush 状态切换）
 *  - 滚轮：以鼠标为中心自由缩放
 *  - 按住滚轮（中键）：拖动画布平移
 *  - 初始自动适配容器；一旦手动缩放/平移后，保持用户视角
 * ───────────────────────────────────────────────────────────── */

// 地图网格 3:4 竖条（宽:高），适配右侧窄高测试区，可绘制范围更大
const MAP_W = 24
const MAP_H = 32
const MIN_ZOOM = 0.05
const MAX_ZOOM = 8

type Fill = Set<string>

function makeIsland(): Fill {
  const s = new Set<string>()
  const cx = MAP_W / 2
  const cy = MAP_H / 2 - 0.5
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const dx = (x - cx) / (MAP_W / 2.6)
      const dy = (y - cy) / (MAP_H / 2.4)
      if (dx * dx + dy * dy < 1) s.add(`${x},${y}`)
    }
  }
  return s
}

function makePond(): Fill {
  const s = new Set<string>()
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const dx = (x - MAP_W / 2) / (MAP_W / 2.7)
      const dy = (y - MAP_H / 2) / (MAP_H / 2.5)
      if (dx * dx + dy * dy > 0.9) s.add(`${x},${y}`)
    }
  }
  return s
}

function makePath(): Fill {
  const s = new Set<string>()
  const pts: [number, number][] = []
  for (let t = 0; t <= 60; t++) {
    const x = 1 + t * ((MAP_W - 2) / 60)
    const y = MAP_H / 2 + Math.round(Math.sin(t / 6) * 2.4)
    pts.push([Math.round(x), y])
  }
  for (const [x, y] of pts) {
    s.add(`${x},${y}`)
    s.add(`${x},${y + 1}`)
  }
  return s
}

interface View {
  zoom: number
  px: number // 地图左上角相对容器的 x 偏移（CSS px）
  py: number // 地图左上角相对容器的 y 偏移（CSS px）
}

export default function ModeCTestMap() {
  const baseCanvases = useEditorStore((s) => s.baseCanvases)
  const mappingType = useEditorStore((s) => s.mappingType)
  const tileSize = useEditorStore((s) => s.tileSize)
  const tiles = useMemo(
    () => deriveTilesFromBase(baseCanvases, mappingType, tileSize),
    [baseCanvases, mappingType, tileSize],
  )

  const [fill, setFill] = useState<Fill>(() => new Set())
  const [brush, setBrush] = useState<"paint" | "erase">("paint")
  const [view, setView] = useState<View>({ zoom: 1, px: 0, py: 0 })
  const [size, setSize] = useState({ w: 0, h: 0 })
  const paintingRef = useRef(false)
  const panRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null)
  const interactedRef = useRef(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef(fill)
  fillRef.current = fill

  const cell = Math.max(4, Math.round(tileSize))

  // 计算自适应视图（地图整体居中，完整可见）
  const fitView = useCallback(
    (w: number, h: number): View => {
      if (w <= 0 || h <= 0) return { zoom: 1, px: 0, py: 0 }
      const z = Math.max(MIN_ZOOM, Math.min(1, (w - 24) / (MAP_W * cell), (h - 24) / (MAP_H * cell)))
      return {
        zoom: z,
        px: Math.round((w - MAP_W * cell * z) / 2),
        py: Math.round((h - MAP_H * cell * z) / 2),
      }
    },
    [cell],
  )

  // 容器尺寸；未手动交互时自动重新 fit
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const update = () => {
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      setSize({ w, h })
      if (!interactedRef.current) setView(fitView(w, h))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [fitView])

  // 渲染
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const dpr = window.devicePixelRatio || 1
    if (size.w === 0 || size.h === 0) return
    if (cv.width !== Math.round(size.w * dpr) || cv.height !== Math.round(size.h * dpr)) {
      cv.width = Math.round(size.w * dpr)
      cv.height = Math.round(size.h * dpr)
    }
    const ctx = cv.getContext("2d", { willReadFrequently: true })
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, size.w, size.h)

    if (tiles.size === 0) {
      ctx.fillStyle = "#94a3b8"
      ctx.font = "14px system-ui, sans-serif"
      ctx.textAlign = "center"
      ctx.fillText("尚无基础像素 — 先在「手绘」页签绘制", size.w / 2, size.h / 2)
      return
    }

    const sc = cell * view.zoom
    const fullTile = mappingType === "16" ? tiles.get(MASK16_FULL) ?? tiles.get(15) : tiles.get(MASK47_FULL) ?? tiles.get(15)
    const filled = (x: number, y: number) =>
      x < 0 || x >= MAP_W || y < 0 || y >= MAP_H ? false : fillRef.current.has(`${x},${y}`)

    // 地图区域不绘制底色，透明格子背景铺满整个可绘制区域
    // 临近缩放 + 整数对齐：把瓦片绘制坐标/尺寸对齐到整数 CSS px，并重叠 1px，
    // 避免非整数 zoom 时相邻瓦片间出现亚像素缝隙（黑线）与平滑插值模糊。
    const drawTile = (tile: HTMLCanvasElement, gx: number, gy: number) => {
      const sx = Math.round(view.px + gx * sc)
      const sy = Math.round(view.py + gy * sc)
      const ts = Math.round(sc) + 1
      ctx.drawImage(tile, sx, sy, ts, ts)
    }

    if (mappingType === "16") {
      // 16 模式：dual-grid 双网格显示。显示网格比世界网格大一圈、偏移半格，
      // mask 由四个角的世界格采样得出：TL=(x-1,y-1), TR=(x,y-1), BL=(x-1,y), BR=(x,y)
      // 位约定与派生瓦片一致（B 约定）：TL=8, TR=4, BL=2, BR=1
      for (let y = 0; y <= MAP_H; y++) {
        for (let x = 0; x <= MAP_W; x++) {
          const mask =
            (filled(x - 1, y - 1) ? 8 : 0) |
            (filled(x, y - 1) ? 4 : 0) |
            (filled(x - 1, y) ? 2 : 0) |
            (filled(x, y) ? 1 : 0)
          if (mask === 0) continue
          const tile = tiles.get(mask) ?? fullTile
          if (tile) {
            drawTile(tile, x - 0.5, y - 0.5)
          }
        }
      }
    } else {
      // 47 模式：8 邻居原始位经 encodeBlob47 归约后，必然命中派生瓦片的 47 个标准 mask，
      // 从而正确显示边界与内外拐角（原始 OR 值会 miss 并 fallback 成纯色块）。
      for (let y = 0; y < MAP_H; y++) {
        for (let x = 0; x < MAP_W; x++) {
          const dx = view.px + x * sc
          const dy = view.py + y * sc
          if (!fillRef.current.has(`${x},${y}`)) {
            // 空地：不绘制，透明格子透出
            continue
          }
          const mask = encodeBlob47({
            n: filled(x, y - 1),
            ne: filled(x + 1, y - 1),
            e: filled(x + 1, y),
            se: filled(x + 1, y + 1),
            s: filled(x, y + 1),
            sw: filled(x - 1, y + 1),
            w: filled(x - 1, y),
            nw: filled(x - 1, y - 1),
          })
          const tile = tiles.get(mask) ?? fullTile
          if (tile) {
            drawTile(tile, x, y)
          } else {
            ctx.fillStyle = "#475569"
            ctx.fillRect(dx, dy, sc + 0.5, sc + 0.5)
          }
        }
      }
    }

    // 地图边界框
    ctx.strokeStyle = "rgba(148,163,184,0.5)"
    ctx.lineWidth = 1
    ctx.strokeRect(view.px - 0.5, view.py - 0.5, MAP_W * sc + 1, MAP_H * sc + 1)
  }, [tiles, fill, size, view, cell])

  // 原生非被动 wheel 监听（滚动缩放）
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const handler = (e: WheelEvent) => wheelHandlerRef.current(e)
    cv.addEventListener("wheel", handler, { passive: false })
    return () => cv.removeEventListener("wheel", handler)
  }, [])

  /** 鼠标位置 → 地图格子（需考虑 view 的缩放与平移） */
  const cellAt = (e: React.PointerEvent<HTMLCanvasElement> | MouseEvent) => {
    const cv = canvasRef.current!
    const rect = cv.getBoundingClientRect()
    const sc = cell * view.zoom
    const x = Math.floor((e.clientX - rect.left - view.px) / sc)
    const y = Math.floor((e.clientY - rect.top - view.py) / sc)
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return null
    return { x, y }
  }

  const paintCell = (x: number, y: number) => {
    const key = `${x},${y}`
    setFill((prev) => {
      if (brush === "paint") {
        if (prev.has(key)) return prev
        const next = new Set(prev)
        next.add(key)
        return next
      }
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // 中键（button===1）：开始拖动画布
    if (e.button === 1) {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      panRef.current = { sx: e.clientX, sy: e.clientY, px: view.px, py: view.py }
      return
    }
    // 左键：涂抹 / 擦除
    if (e.button === 0) {
      e.currentTarget.setPointerCapture(e.pointerId)
      paintingRef.current = true
      const c = cellAt(e)
      if (c) paintCell(c.x, c.y)
    }
  }
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (panRef.current) {
      interactedRef.current = true
      const p = panRef.current
      setView((v) => ({ ...v, px: p.px + (e.clientX - p.sx), py: p.py + (e.clientY - p.sy) }))
      return
    }
    if (!paintingRef.current) return
    const c = cellAt(e)
    if (c) paintCell(c.x, c.y)
  }
  const onUp = () => {
    panRef.current = null
    paintingRef.current = false
  }

  // 滚轮：以鼠标为中心缩放。用原生非被动监听，保证 preventDefault 生效
  //（React 合成 wheel 事件默认 passive，preventDefault 会被忽略）
  const wheelHandlerRef = useRef<(e: WheelEvent) => void>(() => {})
  wheelHandlerRef.current = (e: WheelEvent) => {
    e.preventDefault()
    interactedRef.current = true
    const cv = canvasRef.current!
    const rect = cv.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
    setView((v) => {
      const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * factor))
      // 保持鼠标下的地图坐标不变
      const mapX = (mx - v.px) / v.zoom
      const mapY = (my - v.py) / v.zoom
      return {
        zoom,
        px: mx - mapX * zoom,
        py: my - mapY * zoom,
      }
    })
  }

  const resetView = () => setView(fitView(size.w, size.h))

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-1.5 text-xs text-zinc-400">
        <span>手绘测试区 · 涂抹地图联动派生瓦片</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setBrush("paint")}
            className={`rounded border px-2 py-0.5 ${brush === "paint" ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300" : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"}`}
          >
            涂抹
          </button>
          <button
            type="button"
            onClick={() => setBrush("erase")}
            className={`rounded border px-2 py-0.5 ${brush === "erase" ? "border-rose-500/60 bg-rose-500/10 text-rose-300" : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"}`}
          >
            擦除
          </button>
          <span className="mx-1 text-zinc-600">|</span>
          <button type="button" onClick={() => setFill(makeIsland())} className="rounded border border-zinc-700 px-2 py-0.5 text-zinc-400 hover:bg-zinc-800">
            岛屿
          </button>
          <button type="button" onClick={() => setFill(makePond())} className="rounded border border-zinc-700 px-2 py-0.5 text-zinc-400 hover:bg-zinc-800">
            池塘
          </button>
          <button type="button" onClick={() => setFill(makePath())} className="rounded border border-zinc-700 px-2 py-0.5 text-zinc-400 hover:bg-zinc-800">
            路径
          </button>
          <button type="button" onClick={() => setFill(new Set())} className="rounded border border-zinc-700 px-2 py-0.5 text-zinc-400 hover:bg-zinc-800">
            清空
          </button>
        </div>
        <span className="ml-auto text-zinc-500">滚轮缩放 · 按住中键拖动 · 左键涂抹/擦除</span>
        <button
          type="button"
          onClick={resetView}
          className="rounded border border-zinc-700 px-2 py-0.5 text-zinc-400 hover:bg-zinc-800"
          title="重置视图"
        >
          重置视图
        </button>
      </div>
      <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden bg-checkerboard">
        <canvas
          ref={canvasRef}
          className="h-full w-full cursor-crosshair touch-none"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
        />
      </div>
    </div>
  )
}
