"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useEditorStore } from "@/lib/store"
import { deriveTilesFromBase, applyOverrides, DUAL_GRID_16_ORDER } from "@/lib/quadrant-stitch"
import { BLOB_STANDARD_ORDER, BLOB_STANDARD_COLUMNS } from "@/lib/tile-mapping"
import { Button } from "@/components/ui/button"
import { MousePointer2, Pencil, RotateCcw, Trash2 } from "lucide-react"

/* ─────────────────────────────────────────────────────────────
 * P2.6 总览：消费 deriveTilesFromBase 实时派生瓦片。
 * baseCanvases 每次编辑 → 派生 Map 重算 → 毫秒级刷新。
 * 16 与 47 统一从 baseCanvases 派生（16 用 drawSpecTile16 拼合 5 块
 * 基础块，47 用象限拼合），保证「固化为像素」（参数生成或切片）后
 * 总览正确刷新，且手绘修改基础块实时反映，与测试地图/导出一致。
 * 瓦片紧密贴合（无间距），格子间绘制淡淡白边；mask 号叠加在左上角。
 * 交互：滚轮以鼠标为中心缩放，按住中键/右键拖拽平移。
 * 编辑：点击格子即选中并高亮，同时用底部工具栏（铅笔/橡皮/填充/
 * 矩形/线条/吸管）直接修改该格，写入 overrides 单格微调覆盖，
 * 测试地图与导出同步生效；Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y 撤销重做。
 * ───────────────────────────────────────────────────────────── */

function useDerivedTiles() {
  const baseCanvases = useEditorStore((s) => s.baseCanvases)
  const mappingType = useEditorStore((s) => s.mappingType)
  const tileSize = useEditorStore((s) => s.tileSize)
  const overrides = useEditorStore((s) => s.overrides)
  const derived = useMemo(
    () => deriveTilesFromBase(baseCanvases, mappingType, tileSize),
    [baseCanvases, mappingType, tileSize],
  )
  return useMemo(() => applyOverrides(derived, overrides), [derived, overrides])
}

interface View {
  zoom: number
  tx: number
  ty: number
}

const PAD = 10

export function ModeCOverview() {
  const tiles = useDerivedTiles()
  const mappingType = useEditorStore((s) => s.mappingType)
  const overrides = useEditorStore((s) => s.overrides)
  const setOverride = useEditorStore((s) => s.setOverride)
  const clearOverride = useEditorStore((s) => s.clearOverride)
  const clearAllOverrides = useEditorStore((s) => s.clearAllOverrides)
  const drawTool = useEditorStore((s) => s.drawTool)
  const brushSize = useEditorStore((s) => s.brushSize)
  const drawColor = useEditorStore((s) => s.drawColor)
  const commitDrawColor = useEditorStore((s) => s.commitDrawColor)
  const pushUndo = useEditorStore((s) => s.pushUndo)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState<View>({ zoom: 1, tx: 0, ty: 0 })
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const interactedRef = useRef(false)
  const mouseRef = useRef<{ x: number; y: number } | null>(null)

  // 编辑状态：选择 / 编辑两种模式
  const [mode, setMode] = useState<"select" | "edit">("select")
  const [selectedMask, setSelectedMask] = useState<number | null>(null)
  const drawingRef = useRef(false)
  const committedUndoRef = useRef(false)
  const strokeRef = useRef<{ mask: number; px0: number; py0: number; img: ImageData } | null>(null)

  const order = mappingType === "16" ? DUAL_GRID_16_ORDER : BLOB_STANDARD_ORDER
  const cols = mappingType === "16" ? 4 : BLOB_STANDARD_COLUMNS
  const rows = Math.ceil(order.length / cols)

  // 最新瓦片集 ref：fitView 依赖稳定，避免覆盖变化时反复重适配
  const tilesRef = useRef(tiles)
  tilesRef.current = tiles

  // 容器尺寸跟踪
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => setSize({ w: wrap.clientWidth, h: wrap.clientHeight }))
    ro.observe(wrap)
    setSize({ w: wrap.clientWidth, h: wrap.clientHeight })
    return () => ro.disconnect()
  }, [])

  // 自适应视图：瓦片网格整体居中（紧密贴合，无间距）
  const fitView = useCallback(
    (w: number, h: number) => {
      if (w <= 0 || h <= 0) return
      const first = order.find((m): m is number => m !== null && tilesRef.current.has(m))
      const t = first !== undefined ? tilesRef.current.get(first) : undefined
      if (!t) return
      const contentW = PAD * 2 + cols * t.width
      const contentH = PAD * 2 + rows * t.width
      const zoom = Math.max(0.1, Math.min(1, (w - 8) / contentW, (h - 8) / contentH))
      setView({
        zoom,
        tx: Math.round((w - contentW * zoom) / 2),
        ty: Math.round((h - contentH * zoom) / 2),
      })
    },
    [order, cols, rows],
  )

  // 初始 / 尺寸变化自动适配；用户交互后不再覆盖
  useEffect(() => {
    if (!interactedRef.current) fitView(size.w, size.h)
  }, [fitView, size])

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
    ctx.clearRect(0, 0, size.w, size.h)
    ctx.imageSmoothingEnabled = false

    if (tiles.size === 0) {
      ctx.fillStyle = "#94a3b8"
      ctx.font = "14px system-ui, sans-serif"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText("尚无基础像素 — 先在「手绘」页签绘制或「固化为像素」", size.w / 2, size.h / 2)
      return
    }

    const first = order.find((m): m is number => m !== null && tiles.has(m))
    const t = first !== undefined ? tiles.get(first) : undefined
    const tSize = t ? t.width : 0
    if (tSize === 0) return
    const { zoom, tx, ty } = view
    const sc = tSize * zoom
    const labelSize = Math.max(6, Math.min(14, 10 * zoom))

    // 绘制瓦片（紧密贴合，无间距），mask 号叠加在左上角
    order.forEach((mask, i) => {
      if (mask === null) return
      const tile = tiles.get(mask)
      if (!tile) return
      const cx = tx + (PAD + (i % cols) * tSize) * zoom
      const cy = ty + (PAD + Math.floor(i / cols) * tSize) * zoom
      ctx.drawImage(tile, cx, cy, sc, sc)

      const label = String(mask)
      ctx.font = `${labelSize}px ui-monospace, monospace`
      const lw = ctx.measureText(label).width
      ctx.fillStyle = "rgba(15,23,42,0.55)"
      ctx.fillRect(cx + 1, cy + 1, lw + 5, labelSize + 2)
      ctx.fillStyle = "rgba(255,255,255,0.85)"
      ctx.textAlign = "left"
      ctx.textBaseline = "middle"
      ctx.fillText(label, cx + 3, cy + 1 + (labelSize + 2) / 2)

      // 已修改（有覆盖）指示点：右上角
      if (overrides[String(mask)]) {
        ctx.fillStyle = "#f59e0b"
        ctx.beginPath()
        ctx.arc(cx + sc - 4, cy + 4, Math.max(2, 3 * zoom), 0, Math.PI * 2)
        ctx.fill()
      }
    })
    ctx.textBaseline = "alphabetic"

    // 格子间淡淡白边（内部网格线，显示格子边界）
    const gridX0 = tx + PAD * zoom
    const gridY0 = ty + PAD * zoom
    const gridW = cols * sc
    const gridH = rows * sc
    ctx.strokeStyle = "rgba(255,255,255,0.18)"
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let c = 1; c < cols; c++) {
      const x = gridX0 + c * sc
      ctx.moveTo(x, gridY0)
      ctx.lineTo(x, gridY0 + gridH)
    }
    for (let r = 1; r < rows; r++) {
      const y = gridY0 + r * sc
      ctx.moveTo(gridX0, y)
      ctx.lineTo(gridX0 + gridW, y)
    }
    ctx.stroke()

    // 选中高亮
    if (selectedMask !== null) {
      const idx = order.indexOf(selectedMask)
      if (idx >= 0) {
        const cx = tx + (PAD + (idx % cols) * tSize) * zoom
        const cy = ty + (PAD + Math.floor(idx / cols) * tSize) * zoom
        ctx.strokeStyle = "#38bdf8"
        ctx.lineWidth = 2
        ctx.strokeRect(cx + 1, cy + 1, sc - 2, sc - 2)
      }
    }
  }, [tiles, mappingType, size, view, selectedMask, overrides, order, cols, rows])

  // 原生非被动 wheel 监听：以鼠标为中心缩放
  const wheelHandlerRef = useRef<(e: WheelEvent) => void>(() => {})
  wheelHandlerRef.current = (e: WheelEvent) => {
    e.preventDefault()
    interactedRef.current = true
    const cv = canvasRef.current!
    const rect = cv.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    setView((v) => {
      const next = Math.max(0.1, Math.min(16, v.zoom * (e.deltaY < 0 ? 1.15 : 0.87)))
      const k = next / v.zoom
      return { zoom: next, tx: mx - (mx - v.tx) * k, ty: my - (my - v.ty) * k }
    })
  }
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const handler = (e: WheelEvent) => wheelHandlerRef.current(e)
    cv.addEventListener("wheel", handler, { passive: false })
    return () => cv.removeEventListener("wheel", handler)
  }, [])

  // 键盘撤销/重做（总览页签下 ModeCCanvas 未挂载，需自行监听）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === "z" && e.shiftKey) {
        e.preventDefault()
        redo()
      } else if (k === "z") {
        e.preventDefault()
        undo()
      } else if (k === "y") {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [undo, redo])

  /** 屏幕坐标 → 命中的瓦片 mask 与屏幕矩形（紧密贴合布局） */
  const tileAt = (clientX: number, clientY: number): { mask: number; x: number; y: number; w: number; h: number } | null => {
    const cv = canvasRef.current
    if (!cv) return null
    const rect = cv.getBoundingClientRect()
    const mx = clientX - rect.left
    const my = clientY - rect.top
    const first = order.find((m): m is number => m !== null && tiles.has(m))
    const t = first !== undefined ? tiles.get(first) : undefined
    if (!t) return null
    const tSize = t.width
    const sc = tSize * view.zoom
    const { zoom, tx, ty } = view
    for (let i = 0; i < order.length; i++) {
      const mask = order[i]
      if (mask === null || !tiles.has(mask)) continue
      const cx = tx + (PAD + (i % cols) * tSize) * zoom
      const cy = ty + (PAD + Math.floor(i / cols) * tSize) * zoom
      if (mx >= cx && mx < cx + sc && my >= cy && my < cy + sc) {
        return { mask, x: cx, y: cy, w: sc, h: sc }
      }
    }
    return null
  }

  /** 获取（或从派生瓦片克隆）某 mask 的覆盖画布 */
  const getOverrideCanvas = (mask: number): HTMLCanvasElement | null => {
    const existing = overrides[String(mask)]
    if (existing) return existing
    const derived = tiles.get(mask)
    if (!derived) return null
    const canvas = document.createElement("canvas")
    canvas.width = derived.width
    canvas.height = derived.height
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.drawImage(derived, 0, 0)
    return canvas
  }

  const paintPixel = (mask: number, px: number, py: number) => {
    const canvas = getOverrideCanvas(mask)
    if (!canvas) return
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const c = drawColor
    const erase = drawTool === "eraser"
    const size = brushSize
    const r = Math.floor(size / 2)
    for (let dy = -r; dy < size - r; dy++) {
      for (let dx = -r; dx < size - r; dx++) {
        const x = px + dx
        const y = py + dy
        if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue
        const i = (y * canvas.width + x) * 4
        if (erase) img.data[i + 3] = 0
        else {
          img.data[i] = c.r
          img.data[i + 1] = c.g
          img.data[i + 2] = c.b
          img.data[i + 3] = c.a
        }
      }
    }
    ctx.putImageData(img, 0, 0)
    setOverride(mask, canvas)
  }

  const floodFill = (mask: number, px: number, py: number) => {
    const canvas = getOverrideCanvas(mask)
    if (!canvas) return
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const { data, width, height } = img
    const idx = (py * width + px) * 4
    const target = { r: data[idx], g: data[idx + 1], b: data[idx + 2], a: data[idx + 3] }
    const erase = drawTool === "eraser"
    const fillC = erase ? { r: 0, g: 0, b: 0, a: 0 } : drawColor
    const sameTarget = (i: number) =>
      data[i] === target.r && data[i + 1] === target.g && data[i + 2] === target.b && data[i + 3] === target.a
    const alreadyFill = (i: number) =>
      data[i] === fillC.r && data[i + 1] === fillC.g && data[i + 2] === fillC.b && data[i + 3] === fillC.a
    if (alreadyFill(idx)) return
    const stack = [idx]
    const seen = new Set<number>([idx])
    while (stack.length) {
      const i = stack.pop()!
      data[i] = fillC.r
      data[i + 1] = fillC.g
      data[i + 2] = fillC.b
      data[i + 3] = fillC.a
      const x = (i / 4) % width
      const y = Math.floor(i / 4 / width)
      const neigh = []
      if (x > 0) neigh.push(i - 4)
      if (x < width - 1) neigh.push(i + 4)
      if (y > 0) neigh.push(i - width * 4)
      if (y < height - 1) neigh.push(i + width * 4)
      for (const n of neigh) {
        if (!seen.has(n) && sameTarget(n)) {
          seen.add(n)
          stack.push(n)
        }
      }
    }
    ctx.putImageData(img, 0, 0)
    setOverride(mask, canvas)
  }

  const pickColor = (mask: number, px: number, py: number) => {
    const canvas = getOverrideCanvas(mask)
    if (!canvas) return
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return
    const d = ctx.getImageData(px, py, 1, 1).data
    commitDrawColor({ r: d[0], g: d[1], b: d[2], a: d[3] })
  }

  const drawLineTo = (img: ImageData, x0: number, y0: number, x1: number, y1: number) => {
    const { width, height } = img
    const c = drawColor
    const erase = drawTool === "eraser"
    const set = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return
      const i = (y * width + x) * 4
      if (erase) img.data[i + 3] = 0
      else {
        img.data[i] = c.r
        img.data[i + 1] = c.g
        img.data[i + 2] = c.b
        img.data[i + 3] = c.a
      }
    }
    let dx = Math.abs(x1 - x0)
    let dy = Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1
    const sy = y0 < y1 ? 1 : -1
    let err = dx - dy
    while (true) {
      set(x0, y0)
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * err
      if (e2 > -dy) {
        err -= dy
        x0 += sx
      }
      if (e2 < dx) {
        err += dx
        y0 += sy
      }
    }
  }

  const drawRectTo = (img: ImageData, x0: number, y0: number, x1: number, y1: number) => {
    const { width, height } = img
    const c = drawColor
    const erase = drawTool === "eraser"
    const xa = Math.max(0, Math.min(x0, x1))
    const xb = Math.min(width - 1, Math.max(x0, x1))
    const ya = Math.max(0, Math.min(y0, y1))
    const yb = Math.min(height - 1, Math.max(y0, y1))
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        const i = (y * width + x) * 4
        if (erase) img.data[i + 3] = 0
        else {
          img.data[i] = c.r
          img.data[i + 1] = c.g
          img.data[i + 2] = c.b
          img.data[i + 3] = c.a
        }
      }
    }
  }

  /** 执行一次笔触（矩形/直线整笔重画，其余逐点） */
  const applyStroke = (mask: number, px: number, py: number) => {
    const tool = drawTool
    const s = strokeRef.current
    if (!s) return
    if (tool === "rect" || tool === "line") {
      const canvas = getOverrideCanvas(s.mask)
      if (!canvas) return
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!
      ctx.putImageData(s.img, 0, 0) // 先还原笔触起点快照，避免叠加
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
      if (tool === "rect") drawRectTo(img, s.px0, s.py0, px, py)
      else drawLineTo(img, s.px0, s.py0, px, py)
      ctx.putImageData(img, 0, 0)
      setOverride(s.mask, canvas)
      return
    }
    paintPixel(mask, px, py)
  }

  /** 在瓦片局部坐标 (px,py) 应用当前工具 */
  const applyToolAt = (mask: number, px: number, py: number) => {
    const tool = drawTool
    if (tool === "picker") {
      pickColor(mask, px, py)
      return
    }
    if (!committedUndoRef.current) {
      pushUndo()
      committedUndoRef.current = true
    }
    if (tool === "fill") {
      floodFill(mask, px, py)
      committedUndoRef.current = false
      return
    }
    drawingRef.current = true
    if (tool === "pencil" || tool === "eraser") {
      paintPixel(mask, px, py)
    }
    const canvas = getOverrideCanvas(mask)
    if (canvas) {
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!
      strokeRef.current = {
        mask,
        px0: px,
        py0: py,
        img: ctx.getImageData(0, 0, canvas.width, canvas.height),
      }
      if (tool === "rect" || tool === "line") applyStroke(mask, px, py)
    }
  }

  /** 屏幕坐标 → 瓦片局部像素坐标 */
  const localPixel = (clientX: number, clientY: number, hit: { x: number; y: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      px: Math.floor((clientX - rect.left - hit.x) / view.zoom),
      py: Math.floor((clientY - rect.top - hit.y) / view.zoom),
    }
  }

  /** 方块光标：与基础五块一致 —— 隐藏系统光标，overlay 绘制吸附像素格的方块 */
  const drawOverlayCursor = useCallback(
    (clientX: number, clientY: number) => {
      const cv = overlayRef.current
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
      ctx.clearRect(0, 0, size.w, size.h)
      if (panRef.current) return // 平移中：只显示系统 grabbing 光标

      // 固定尺寸十字准星：上下左右各一道、中心留空，不随缩放改变
      const arm = 14
      const drawCrosshair = (cx: number, cy: number, gap: number) => {
        ctx.strokeStyle = "rgba(255,255,255,0.9)"
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(cx - gap - arm, cy)
        ctx.lineTo(cx - gap, cy)
        ctx.moveTo(cx + gap, cy)
        ctx.lineTo(cx + gap + arm, cy)
        ctx.moveTo(cx, cy - gap - arm)
        ctx.lineTo(cx, cy - gap)
        ctx.moveTo(cx, cy + gap)
        ctx.lineTo(cx, cy + gap + arm)
        ctx.stroke()
      }

      const hit = tileAt(clientX, clientY)
      if (!hit) {
        // 格子外：仅显示固定十字准星，中心跟随鼠标
        const rect = canvasRef.current!.getBoundingClientRect()
        drawCrosshair(clientX - rect.left, clientY - rect.top, 6)
        return
      }
      // 笔刷大小方块，吸附瓦片局部像素格
      const { px, py } = localPixel(clientX, clientY, hit)
      const bs = brushSize
      const r = Math.floor(bs / 2)
      const sx = hit.x + (px - r) * view.zoom
      const sy = hit.y + (py - r) * view.zoom
      const s = Math.max(1, bs * view.zoom)
      // 笔刷方块（随笔刷大小实时调整）
      ctx.fillStyle = "rgba(255,255,255,0.25)"
      ctx.fillRect(sx, sy, s, s)
      ctx.strokeStyle = "rgba(0,0,0,0.9)"
      ctx.lineWidth = 2
      ctx.strokeRect(sx, sy, s, s)
      ctx.strokeStyle = "rgba(255,255,255,0.95)"
      ctx.lineWidth = 1
      ctx.strokeRect(sx + 1, sy + 1, Math.max(0, s - 2), Math.max(0, s - 2))
      // 十字准星环绕方块外围
      drawCrosshair(sx + s / 2, sy + s / 2, s / 2 + 4)
    },
    [size, view, brushSize, tileAt, localPixel],
  )

  // 视图/笔刷变化时重画方块光标
  useEffect(() => {
    if (mouseRef.current) drawOverlayCursor(mouseRef.current.x, mouseRef.current.y)
  }, [view, brushSize, drawOverlayCursor])

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) {
      // 中键 / 右键拖拽平移
      interactedRef.current = true
      panRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    const hit = tileAt(e.clientX, e.clientY)
    if (!hit) {
      setSelectedMask(null)
      return
    }
    setSelectedMask(hit.mask)
    if (mode === "edit") {
      const { px, py } = localPixel(e.clientX, e.clientY, hit)
      applyToolAt(hit.mask, px, py)
    }
  }

  // 鼠标重新进入画布时立即重绘光标（若 onPointerMove 未触发，光标不会更新）
  const onPointerEnter = (e: React.PointerEvent<HTMLCanvasElement>) => {
    mouseRef.current = { x: e.clientX, y: e.clientY }
    drawOverlayCursor(e.clientX, e.clientY)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    mouseRef.current = { x: e.clientX, y: e.clientY }
    if (panRef.current) {
      interactedRef.current = true
      const p = panRef.current
      setView((v) => ({ ...v, tx: p.tx + (e.clientX - p.x), ty: p.ty + (e.clientY - p.y) }))
      return
    }
    drawOverlayCursor(e.clientX, e.clientY)
    if (!drawingRef.current || mode !== "edit") return
    const hit = tileAt(e.clientX, e.clientY)
    if (!hit) return
    const { px, py } = localPixel(e.clientX, e.clientY, hit)
    const tool = drawTool
    if ((tool === "rect" || tool === "line") && strokeRef.current) {
      applyStroke(strokeRef.current.mask, px, py)
    } else {
      applyStroke(hit.mask, px, py)
    }
  }

  const onPointerUp = () => {
    panRef.current = null
    drawingRef.current = false
    committedUndoRef.current = false
    strokeRef.current = null
  }

  const onPointerLeave = () => {
    mouseRef.current = null
    const cv = overlayRef.current
    if (cv) {
      const ctx = cv.getContext("2d")
      if (ctx) ctx.clearRect(0, 0, cv.width, cv.height)
    }
    onPointerUp()
  }

  const overrideCount = Object.keys(overrides).length

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-1.5 text-xs text-zinc-400">
        <span>
          {mappingType === "16" ? "16 模式" : "47 模式"}全部瓦片 · {tiles.size} 张
        </span>
        <span className="mx-1 h-4 w-px bg-zinc-700" />
        <div className="flex items-center gap-1">
          <Button size="xs" variant={mode === "select" ? "secondary" : "ghost"} onClick={() => setMode("select")}>
            <MousePointer2 />
            选择
          </Button>
          <Button size="xs" variant={mode === "edit" ? "secondary" : "ghost"} onClick={() => setMode("edit")}>
            <Pencil />
            编辑
          </Button>
        </div>
        <span className="mx-1 h-4 w-px bg-zinc-700" />
        <Button
          size="xs"
          variant="ghost"
          disabled={selectedMask === null || !overrides[String(selectedMask)]}
          onClick={() => selectedMask !== null && clearOverride(selectedMask)}
        >
          <RotateCcw />
          还原
        </Button>
        <Button size="xs" variant="ghost" disabled={overrideCount === 0} onClick={clearAllOverrides}>
          <Trash2 />
          清空覆盖
        </Button>
        <span className="ml-auto">
          {selectedMask !== null
            ? `已选 mask ${selectedMask}${overrides[String(selectedMask)] ? "（已修改）" : ""}`
            : "点击格子直接绘制"}
          {" · "}滚轮缩放 · 中键/右键拖拽平移
        </span>
      </div>
      <div ref={wrapRef} className="relative min-h-0 flex-1 bg-checkerboard">
        <canvas
          ref={canvasRef}
          className="h-full w-full touch-none"
          style={{
            cursor: panRef.current ? "grabbing" : "none",
          }}
          onPointerEnter={onPointerEnter}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
          onContextMenu={(e) => e.preventDefault()}
        />
        {/* 方块光标覆盖层：笔刷方块，吸附瓦片局部像素格 */}
        <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full touch-none" />
        <div className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-zinc-400">
          点击格子直接绘制并高亮（铅笔/橡皮/填充/矩形/线条/吸管，见下方工具栏）
        </div>
      </div>
    </div>
  )
}
