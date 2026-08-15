"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useEditorStore } from "@/lib/store"
import { deriveTilesFromBase, applyOverrides, MASK16_FULL, MASK47_FULL } from "@/lib/quadrant-stitch"
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

// 无限绘制：稀疏 Set 存储，无固定地图边界
const MIN_ZOOM = 0.05
const MAX_ZOOM = 8

type Fill = Set<string>

function makeIsland(): Fill {
  const s = new Set<string>()
  for (let y = -16; y < 16; y++) {
    for (let x = -12; x < 12; x++) {
      const dx = x / 10
      const dy = y / 12
      if (dx * dx + dy * dy < 1) s.add(`${x},${y}`)
    }
  }
  return s
}

function makePond(): Fill {
  const s = new Set<string>()
  for (let y = -16; y < 16; y++) {
    for (let x = -12; x < 12; x++) {
      const dx = x / 9
      const dy = y / 12
      if (dx * dx + dy * dy > 0.9) s.add(`${x},${y}`)
    }
  }
  return s
}

function makePath(): Fill {
  const s = new Set<string>()
  const pts: [number, number][] = []
  for (let t = 0; t <= 60; t++) {
    const x = Math.round(-20 + t * (40 / 60))
    const y = Math.round(Math.sin(t / 6) * 2.4)
    pts.push([x, y])
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
  const overrides = useEditorStore((s) => s.overrides)
  const tiles = useMemo(
    () => applyOverrides(deriveTilesFromBase(baseCanvases, mappingType, tileSize), overrides),
    [baseCanvases, mappingType, tileSize, overrides],
  )

  const [fill, setFill] = useState<Fill>(() => new Set())
  const [brush, setBrush] = useState<"paint" | "erase">("paint")
  // 视口存 store：切页/切换输入源后回到原视角
  const view = useEditorStore((s) => s.testView)
  const setView = useEditorStore((s) => s.setTestView)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const paintingRef = useRef(false)
  const panRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null)
  const interactedRef = useRef(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef(fill)
  fillRef.current = fill

  const cell = Math.max(4, Math.round(tileSize))

  // 计算自适应视图（无限绘制：初始居中到世界原点，默认显示 24×32 区域）
  const fitView = useCallback(
    (w: number, h: number): View => {
      if (w <= 0 || h <= 0) return { zoom: 1, px: 0, py: 0 }
      const z = Math.max(MIN_ZOOM, Math.min(1, (w - 24) / (24 * cell), (h - 24) / (32 * cell)))
      return {
        zoom: z,
        px: Math.round(w / 2),
        py: Math.round(h / 2),
      }
    },
    [cell],
  )

  // 把视图适配到给定格子的包围盒（图案按钮用：生成后直接居中显示）
  const fitToCells = useCallback(
    (target: Fill) => {
      if (size.w <= 0 || size.h <= 0) return
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      for (const key of target) {
        const [x, y] = key.split(",").map(Number)
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
      if (minX === Infinity) return
      const contentW = (maxX - minX + 1) * cell
      const contentH = (maxY - minY + 1) * cell
      const z = Math.max(MIN_ZOOM, Math.min(1, (size.w - 24) / contentW, (size.h - 24) / contentH))
      setView({
        zoom: z,
        px: Math.round(size.w / 2 - ((minX + maxX + 1) / 2) * cell * z),
        py: Math.round(size.h / 2 - ((minY + maxY + 1) / 2) * cell * z),
      })
    },
    [cell, size],
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
      ctx.fillText("尚无基础像素 — 左侧调参实时生成，或导入切片后「固化为像素」", size.w / 2, size.h / 2)
      return
    }

    const sc = cell * view.zoom
    const fullTile = mappingType === "16" ? tiles.get(MASK16_FULL) ?? tiles.get(15) : tiles.get(MASK47_FULL) ?? tiles.get(15)
    // 无限绘制：邻居查询不再受固定地图边界限制
    const filled = (x: number, y: number) => fillRef.current.has(`${x},${y}`)

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
      // 16 模式：dual-grid 双网格显示。mask 由四个角的世界格采样得出：
      // TL=(x-1,y-1), TR=(x,y-1), BL=(x-1,y), BR=(x,y)（B 位约定 TL=8,TR=4,BL=2,BR=1）。
      // 稀疏 Set + cells 迭代：每个有内容的格贡献 4 个角，去重后绘制，避免包围盒遍历爆炸
      const drawn = new Set<string>()
      for (const key of fill) {
        const [cx, cy] = key.split(",").map(Number)
        for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
          const x = cx + ox
          const y = cy + oy
          const ck = `${x},${y}`
          if (drawn.has(ck)) continue
          drawn.add(ck)
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
      // 47 模式：稀疏 Set + cells 迭代，复杂度 O(活跃格数)，与绘制范围无关
      for (const key of fill) {
        const [x, y] = key.split(",").map(Number)
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
          const dx = view.px + x * sc
          const dy = view.py + y * sc
          ctx.fillStyle = "#475569"
          ctx.fillRect(dx, dy, sc + 0.5, sc + 0.5)
        }
      }
    }

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
    // 无限绘制：任意坐标均可绘制（稀疏 Set 存储，无边界限制）
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
          <button
            type="button"
            onClick={() => {
              const p = makeIsland()
              setFill(p)
              fitToCells(p)
            }}
            className="rounded border border-zinc-700 px-2 py-0.5 text-zinc-400 hover:bg-zinc-800"
          >
            岛屿
          </button>
          <button
            type="button"
            onClick={() => {
              const p = makePond()
              setFill(p)
              fitToCells(p)
            }}
            className="rounded border border-zinc-700 px-2 py-0.5 text-zinc-400 hover:bg-zinc-800"
          >
            池塘
          </button>
          <button
            type="button"
            onClick={() => {
              const p = makePath()
              setFill(p)
              fitToCells(p)
            }}
            className="rounded border border-zinc-700 px-2 py-0.5 text-zinc-400 hover:bg-zinc-800"
          >
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
