"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useEditorStore } from "@/lib/store"
import type { DrawTool } from "@/lib/types"
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react"

/* ─────────────────────────────────────────────────────────────
 * P2 手绘引擎（2.2/2.3/2.4）
 * 5 块基础像素画布 + 像素网格 + 滚轮中心缩放；
 * 铅笔/橡皮/油漆桶/吸管/矩形/直线 按 tileSize 写 ImageData；
 * ∞ 通透：越界回绕 + 8 副本半透明平铺 + 笔触同步。
 * ───────────────────────────────────────────────────────────── */

const SLOT16 = [
  { key: "convex", label: "凸" },
  { key: "fg", label: "前景" },
  { key: "bg", label: "背景" },
  { key: "concave", label: "凹" },
  { key: "edge", label: "边" },
] as const

const SLOT47 = [
  { key: "outer", label: "外" },
  { key: "solid", label: "实" },
  { key: "empty", label: "空" },
  { key: "inner", label: "内" },
  { key: "edge", label: "边" },
] as const

interface RGBA {
  r: number
  g: number
  b: number
  a: number
}

/** 把像素写进 ImageData.data（橡皮→透明） */
function setPx(data: Uint8ClampedArray, w: number, x: number, y: number, c: RGBA, erase: boolean) {
  const i = (y * w + x) * 4
  if (erase) {
    data[i + 3] = 0
    return
  }
  data[i] = c.r
  data[i + 1] = c.g
  data[i + 2] = c.b
  data[i + 3] = c.a
}

interface Block {
  key: string
  label: string
  canvas: HTMLCanvasElement
  ox: number
  oy: number
}

export default function ModeCCanvas() {
  const baseCanvases = useEditorStore((s) => s.baseCanvases)
  const mappingType = useEditorStore((s) => s.mappingType)
  const tileSize = useEditorStore((s) => s.tileSize)
  const drawTool = useEditorStore((s) => s.drawTool)
  const setDrawTool = useEditorStore((s) => s.setDrawTool)
  const drawTileTransparent = useEditorStore((s) => s.drawTileTransparent)
  const setDrawTileTransparent = useEditorStore((s) => s.setDrawTileTransparent)
  const drawTileColorDiff = useEditorStore((s) => s.drawTileColorDiff)
  const drawShowGrid = useEditorStore((s) => s.drawShowGrid)
  const setDrawShowGrid = useEditorStore((s) => s.setDrawShowGrid)
  const brushSize = useEditorStore((s) => s.brushSize)
  const setBaseCanvases = useEditorStore((s) => s.setBaseCanvases)
  const setBaseDirty = useEditorStore((s) => s.setBaseDirty)
  const pushUndo = useEditorStore((s) => s.pushUndo)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)
  const canUndo = useEditorStore((s) => s.undoStack.length > 0)
  const canRedo = useEditorStore((s) => s.redoStack.length > 0)

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // 独立覆盖层画布：绘制像素吸附光标（pointer-events:none，不拦截输入）
  const overlayRef = useRef<HTMLCanvasElement>(null)
  // 鼠标最近一次世界坐标（块外也记录，用于回绕显示光标）
  const mouseWorldRef = useRef<{ wx: number; wy: number } | null>(null)

  // 视口存 store：切输入源/切页后回到原视角
  const view = useEditorStore((s) => s.centerView)
  const setView = useEditorStore((s) => s.setCenterView)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const color = useEditorStore((s) => s.drawColor)
  const commitDrawColor = useEditorStore((s) => s.commitDrawColor)
  const pickColorSlot = useEditorStore((s) => s.pickColorSlot)

  const strokeRef = useRef<{ b: Block; px0: number; py0: number; img: ImageData } | null>(null)
  const drawingRef = useRef(false)
  const committedUndoRef = useRef(false)
  const panRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)

  const slotList = mappingType === "16" ? SLOT16 : SLOT47

  const blocks = useMemo<Block[]>(() => {
    const canvases: { key: string; label: string; canvas: HTMLCanvasElement }[] = []
    for (const s of slotList) {
      const canvas = baseCanvases[s.key]
      if (canvas) canvases.push({ key: s.key, label: s.label, canvas })
    }
    if (canvases.length === 0) return []
    const maxW = Math.max(...canvases.map((b) => b.canvas.width))
    const maxH = Math.max(...canvases.map((b) => b.canvas.height))
    // 九宫格布局：图块间距 = 两倍图块大小，四周留白 = 图块大小。
    // 基于实际块尺寸（canvas.width）而非 tileSize，保证 47 模式半块（qSize）等比缩放
    const gap = Math.max(1, Math.round(maxW * 2))
    const pad = Math.max(1, Math.round(maxW))
    return canvases.map((b, i) => ({
      ...b,
      ox: pad + (i % 3) * (maxW + gap),
      oy: pad + Math.floor(i / 3) * (maxH + gap),
    }))
  }, [baseCanvases, slotList, tileSize])

  // 镜像 ref，供事件处理器读取最新值
  const viewRef = useRef(view)
  viewRef.current = view
  const blocksRef = useRef(blocks)
  blocksRef.current = blocks
  const baseCanvasesRef = useRef(baseCanvases)
  baseCanvasesRef.current = baseCanvases
  const toolRef = useRef(drawTool)
  toolRef.current = drawTool
  const colorRef = useRef(color)
  colorRef.current = color
  const brushSizeRef = useRef(brushSize)
  brushSizeRef.current = brushSize

  // 画布尺寸跟随容器（dpr 感知）
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => {
      setSize({ w: wrap.clientWidth, h: wrap.clientHeight })
    })
    ro.observe(wrap)
    setSize({ w: wrap.clientWidth, h: wrap.clientHeight })
    return () => ro.disconnect()
  }, [])

  const fit = useCallback(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const w = wrap.clientWidth
    const h = wrap.clientHeight
    if (blocksRef.current.length === 0 || w === 0 || h === 0) return
    const maxW = Math.max(...blocksRef.current.map((b) => b.canvas.width))
    const maxH = Math.max(...blocksRef.current.map((b) => b.canvas.height))
    const cols = Math.min(3, blocksRef.current.length)
    const rows = Math.ceil(blocksRef.current.length / 3)
    const gap = Math.max(1, Math.round(maxW * 2))
    const pad = Math.max(1, Math.round(maxW))
    const contentW = pad + cols * maxW + (cols - 1) * gap + pad
    const contentH = pad + rows * maxH + (rows - 1) * gap + pad + 16
    const zoom = Math.max(0.5, Math.min(8, Math.floor(Math.min(w / contentW, h / contentH) * 4) / 4))
    setView({
      zoom,
      tx: Math.round((w - contentW * zoom) / 2),
      ty: Math.round((h - contentH * zoom) / 2),
    })
  }, [tileSize])

  // 空→非空时自动适配
  const prevLen = useRef(0)
  useEffect(() => {
    if (blocks.length > 0 && prevLen.current === 0) fit()
    prevLen.current = blocks.length
  }, [blocks, fit])

  // 绘制主循环
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const dpr = window.devicePixelRatio || 1
    const w = size.w
    const h = size.h
    if (w === 0 || h === 0) return
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
    }
    const ctx = cv.getContext("2d", { willReadFrequently: true })
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.imageSmoothingEnabled = false

    if (blocksRef.current.length > 0) {
      const { zoom, tx, ty } = viewRef.current
      const copies = drawTileTransparent
        ? [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => ({ dx, dy })))
        : [{ dx: 0, dy: 0 }]

    for (const b of blocksRef.current) {
      const sx = b.ox * zoom + tx
      const sy = b.oy * zoom + ty
      const sw = b.canvas.width * zoom
      const sh = b.canvas.height * zoom

      for (const { dx, dy } of copies) {
        // 色差显示开启时，周围副本半透明偏暗；关闭时副本与中心一致（无色差）
        ctx.globalAlpha = dx === 0 && dy === 0 ? 1 : drawTileColorDiff ? 0.35 : 1
        ctx.drawImage(b.canvas, sx + dx * sw, sy + dy * sh, sw, sh)
      }
      ctx.globalAlpha = 1

      ctx.strokeStyle = "rgba(148,163,184,0.75)"
      ctx.lineWidth = 1
      ctx.strokeRect(sx - 0.5, sy - 0.5, sw + 1, sh + 1)

      if (drawShowGrid) {
        ctx.strokeStyle = "rgba(100,116,139,0.30)"
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let px = 1; px < b.canvas.width; px++) {
          const x = sx + px * zoom
          ctx.moveTo(x + 0.5, sy)
          ctx.lineTo(x + 0.5, sy + sh)
        }
        for (let py = 1; py < b.canvas.height; py++) {
          const y = sy + py * zoom
          ctx.moveTo(sx, y + 0.5)
          ctx.lineTo(sx + sw, y + 0.5)
        }
        ctx.stroke()
      }

      ctx.fillStyle = "rgba(15,23,42,0.78)"
      ctx.font = "12px system-ui, sans-serif"
      ctx.textAlign = "center"
      ctx.fillText(b.label, sx + sw / 2, sy - 6)
    }
    }

    // （光标由下方独立 overlay 画布绘制，见 drawOverlayCursor，无需在此绘制）
  }, [baseCanvases, view, size, drawTileTransparent, drawTileColorDiff, drawShowGrid])

  // ── 像素吸附光标：画在独立 overlay 画布上（不随主画布重绘被抹掉）──
  // 大小 = 笔刷大小 × 像素格缩放（zoom），严格对齐像素格。
  // 鼠标在块内：单个光标，吸附在鼠标所在像素格；
  // 鼠标在块外：双光标 —— 白色跟随鼠标，天蓝色显示方块内对应回绕绘制位置（∞ 通透/越界绘制预览）。
  const drawOverlayCursor = useCallback(
    (wx: number, wy: number) => {
      const cv = overlayRef.current
      if (!cv) return
      const dpr = window.devicePixelRatio || 1
      const w = size.w
      const h = size.h
      if (w === 0 || h === 0) return
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr)
        cv.height = Math.round(h * dpr)
      }
      const ctx = cv.getContext("2d", { willReadFrequently: true })
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const { zoom, tx, ty } = viewRef.current
      const bs = brushSizeRef.current
      const r = Math.floor(bs / 2)
      // 以世界像素格左上角 (gx, gy) 画一个 bs×bs 的笔刷方块
      const drawBrushAt = (gx: number, gy: number, accent: boolean) => {
        const sx = gx * zoom + tx
        const sy = gy * zoom + ty
        const s = bs * zoom
        if (s <= 0) return
        ctx.fillStyle = accent ? "rgba(56,189,248,0.35)" : "rgba(255,255,255,0.25)"
        ctx.fillRect(sx, sy, s, s)
        ctx.strokeStyle = accent ? "rgba(56,189,248,0.95)" : "rgba(0,0,0,0.9)"
        ctx.lineWidth = 2
        ctx.strokeRect(sx, sy, s, s)
        ctx.strokeStyle = accent ? "rgba(125,211,252,1)" : "rgba(255,255,255,0.95)"
        ctx.lineWidth = 1
        ctx.strokeRect(sx + 1, sy + 1, Math.max(0, s - 2), Math.max(0, s - 2))
      }
      // 鼠标是否直接命中某个方块
      const exact = blocksRef.current.find(
        (b) => wx >= b.ox && wx < b.ox + b.canvas.width && wy >= b.oy && wy < b.oy + b.canvas.height,
      )
      // 吸附统一用 floor（与 paintPixel/pixelAt 的绘制逻辑一致），
      // 避免 round 在格子右半部分进位导致光标与绘制位置错开一像素
      const followX = Math.floor(wx) - r
      const followY = Math.floor(wy) - r
      if (exact) {
        // 块内：单个跟随光标
        drawBrushAt(followX, followY, false)
      } else {
        // 块外：跟随光标 + 方块内回绕绘制位置（天蓝色）
        drawBrushAt(followX, followY, false)
        const b = blockAt(wx, wy)
        if (b) {
          const { px, py } = pixelAt(b, wx, wy)
          drawBrushAt(b.ox + px - r, b.oy + py - r, true)
        }
      }
      // 固定尺寸十字准星：上下左右各一道、中心留空，环绕跟随方块，不随缩放改变
      const fsx = followX * zoom + tx
      const fsy = followY * zoom + ty
      const fs = bs * zoom
      const fcx = fsx + fs / 2
      const fcy = fsy + fs / 2
      const arm = 14
      const gap = fs / 2 + 4
      ctx.strokeStyle = "rgba(255,255,255,0.9)"
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(fcx - gap - arm, fcy)
      ctx.lineTo(fcx - gap, fcy)
      ctx.moveTo(fcx + gap, fcy)
      ctx.lineTo(fcx + gap + arm, fcy)
      ctx.moveTo(fcx, fcy - gap - arm)
      ctx.lineTo(fcx, fcy - gap)
      ctx.moveTo(fcx, fcy + gap)
      ctx.lineTo(fcx, fcy + gap + arm)
      ctx.stroke()
    },
    [size],
  )

  // view（缩放/平移）或笔刷大小变化时，用最新参数重画光标
  useEffect(() => {
    const m = mouseWorldRef.current
    if (m) drawOverlayCursor(m.wx, m.wy)
  }, [view, brushSize, drawOverlayCursor])

  // 键盘撤销/重做 + 颜色槽快捷键（1~9、0 切换笔刷颜色）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 输入框内不响应（笔刷大小输入框等）
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key
      if (/^[0-9]$/.test(k)) {
        // 1→槽0，2→槽1 … 9→槽8，0→槽9
        pickColorSlot(k === "0" ? 9 : Number(k) - 1)
        return
      }
      if (!(e.ctrlKey || e.metaKey)) return
      if (k.toLowerCase() === "z" && e.shiftKey) {
        e.preventDefault()
        redo()
      } else if (k.toLowerCase() === "z") {
        e.preventDefault()
        undo()
      } else if (k.toLowerCase() === "y") {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [undo, redo, pickColorSlot])

  const screenToWorld = (e: React.PointerEvent) => {
    const cv = canvasRef.current!
    const rect = cv.getBoundingClientRect()
    const { zoom, tx, ty } = viewRef.current
    return {
      wx: (e.clientX - rect.left - tx) / zoom,
      wy: (e.clientY - rect.top - ty) / zoom,
    }
  }

  const blockAt = (wx: number, wy: number): Block | null => {
    let best: Block | null = null
    let bestD = Infinity
    for (const b of blocksRef.current) {
      if (wx >= b.ox && wx < b.ox + b.canvas.width && wy >= b.oy && wy < b.oy + b.canvas.height) return b
      const cx = b.ox + b.canvas.width / 2
      const cy = b.oy + b.canvas.height / 2
      const d = (wx - cx) ** 2 + (wy - cy) ** 2
      if (d < bestD) {
        bestD = d
        best = b
      }
    }
    return best
  }

  /** 世界坐标 → 块内像素（越界回绕） */
  const pixelAt = (b: Block, wx: number, wy: number) => {
    const w = b.canvas.width
    const h = b.canvas.height
    const px = Math.floor(wx - b.ox)
    const py = Math.floor(wy - b.oy)
    return { px: ((px % w) + w) % w, py: ((py % h) + h) % h }
  }

  const commitEdit = (b: Block, mutate: (data: Uint8ClampedArray, w: number, h: number) => void) => {
    const cv = b.canvas
    const ctx = cv.getContext("2d", { willReadFrequently: true })!
    const img = ctx.getImageData(0, 0, cv.width, cv.height)
    mutate(img.data, cv.width, cv.height)
    ctx.putImageData(img, 0, 0)
    setBaseCanvases({ ...baseCanvasesRef.current })
  }

  const paintPixel = (b: Block, px: number, py: number) => {
    const c = colorRef.current
    const erase = toolRef.current === "eraser"
    // 画笔/橡皮共用同一笔刷大小：以 (px,py) 为中心绘制 size×size 方形（越界回绕）
    const size = brushSizeRef.current
    const r = Math.floor(size / 2)
    commitEdit(b, (data, w) => {
      for (let dy = -r; dy < size - r; dy++) {
        for (let dx = -r; dx < size - r; dx++) {
          const x = ((px + dx) % w + w) % w
          const y = ((py + dy) % w + w) % w
          setPx(data, w, x, y, c, erase)
        }
      }
    })
  }

  const pickColor = (b: Block, px: number, py: number) => {
    const ctx = b.canvas.getContext("2d", { willReadFrequently: true })!
    const d = ctx.getImageData(px, py, 1, 1).data
    // 吸管取色属于修改颜色：自动存入下一个颜色槽
    commitDrawColor({ r: d[0], g: d[1], b: d[2], a: d[3] })
  }

  const floodFill = (b: Block, px: number, py: number) => {
    const cv = b.canvas
    const ctx = cv.getContext("2d", { willReadFrequently: true })!
    const img = ctx.getImageData(0, 0, cv.width, cv.height)
    const { data, width, height } = img
    const idx = (py * width + px) * 4
    const target = { r: data[idx], g: data[idx + 1], b: data[idx + 2], a: data[idx + 3] }
    const erase = toolRef.current === "eraser"
    const fillC = erase ? { r: 0, g: 0, b: 0, a: 0 } : colorRef.current
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
    setBaseCanvases({ ...baseCanvasesRef.current })
  }

  const drawLineTo = (img: ImageData, x0: number, y0: number, x1: number, y1: number) => {
    const { width, height } = img
    const c = colorRef.current
    const erase = toolRef.current === "eraser"
    const set = (x: number, y: number) =>
      setPx(img.data, width, ((x % width) + width) % width, ((y % height) + height) % height, c, erase)
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
    const c = colorRef.current
    const erase = toolRef.current === "eraser"
    const xa = Math.min(x0, x1)
    const xb = Math.max(x0, x1)
    const ya = Math.min(y0, y1)
    const yb = Math.max(y0, y1)
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        setPx(img.data, width, ((x % width) + width) % width, ((y % height) + height) % height, c, erase)
      }
    }
  }

  /** 执行一次笔触（铅笔/橡皮在 pointermove 时按像素走；矩形/直线每次整笔重画） */
  const applyStroke = (b: Block, px: number, py: number) => {
    const tool = toolRef.current
    const s = strokeRef.current
    if (!s) return
    if (tool === "rect" || tool === "line") {
      // 以笔触起点所在块为准（矩形/直线跨块时统一写回起点块）
      const tgt = s.b
      const ctx = tgt.canvas.getContext("2d", { willReadFrequently: true })!
      ctx.putImageData(s.img, 0, 0) // 先还原笔触起点快照，避免叠加
      const img = ctx.getImageData(0, 0, tgt.canvas.width, tgt.canvas.height)
      if (tool === "rect") drawRectTo(img, s.px0, s.py0, px, py)
      else drawLineTo(img, s.px0, s.py0, px, py)
      ctx.putImageData(img, 0, 0)
      setBaseCanvases({ ...baseCanvasesRef.current })
      return
    }
    // 铅笔 / 橡皮：连续描点
    paintPixel(b, px, py)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) {
      // 中键 / 右键拖拽平移
      panRef.current = { x: e.clientX, y: e.clientY, panX: viewRef.current.tx, panY: viewRef.current.ty }
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    const { wx, wy } = screenToWorld(e)
    const b = blockAt(wx, wy)
    if (!b) return
    const { px, py } = pixelAt(b, wx, wy)
    const tool = toolRef.current

    if (tool === "picker") {
      pickColor(b, px, py)
      return
    }

    // 一次笔触只压一次撤销栈；手绘笔触即脱离参数实时联动（防误触闸门）
    if (!committedUndoRef.current) {
      pushUndo()
      committedUndoRef.current = true
      setBaseDirty(true)
    }
    drawingRef.current = true

    if (tool === "fill") {
      floodFill(b, px, py)
      drawingRef.current = false
      committedUndoRef.current = false
      return
    }
    if (tool === "pencil" || tool === "eraser") {
      paintPixel(b, px, py)
    }
    // rect / line：记录起点 + 画布像素快照
    strokeRef.current = { b, px0: px, py0: py, img: b.canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, b.canvas.width, b.canvas.height) }
    if (tool === "rect" || tool === "line") {
      applyStroke(b, px, py)
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (panRef.current) {
      // 先取快照再更新：函数式 setState 在渲染期执行 reducer，
      // 若直接读 panRef.current，可能被 onPointerUp 清空而读到 null
      const pan = panRef.current
      setView((v) => ({
        ...v,
        tx: pan.panX + (e.clientX - pan.x),
        ty: pan.panY + (e.clientY - pan.y),
      }))
      return
    }
    const { wx, wy } = screenToWorld(e)
    // 同步重画像素吸附光标（含块外回绕）；平移期间由 view 变化 effect 负责重画
    mouseWorldRef.current = { wx, wy }
    drawOverlayCursor(wx, wy)
    const b = blockAt(wx, wy)
    if (b) {
      const { px, py } = pixelAt(b, wx, wy)
      if (drawingRef.current) {
        const tool = toolRef.current
        if ((tool === "rect" || tool === "line") && strokeRef.current) {
          // 矩形/直线以起点块为坐标系，像素相对起点块回绕
          const { px: px2, py: py2 } = pixelAt(strokeRef.current.b, wx, wy)
          applyStroke(strokeRef.current.b, px2, py2)
        } else {
          applyStroke(b, px, py)
        }
      }
    }
  }

  const onPointerUp = () => {
    drawingRef.current = false
    committedUndoRef.current = false
    strokeRef.current = null
    panRef.current = null
    // 平移/绘制结束后，用最新 view 重画光标
    const m = mouseWorldRef.current
    if (m) drawOverlayCursor(m.wx, m.wy)
  }

  const onPointerLeave = () => {
    mouseWorldRef.current = null
    const cv = overlayRef.current
    if (!cv) return
    const ctx = cv.getContext("2d", { willReadFrequently: true })
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, cv.width, cv.height)
  }

  // 原生非被动 wheel 监听，保证 preventDefault 生效（React 合成事件默认被动）
  const wheelHandlerRef = useRef<(e: WheelEvent) => void>(() => {})
  wheelHandlerRef.current = (e: WheelEvent) => {
    e.preventDefault()
    const cv = canvasRef.current!
    const rect = cv.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    setView((v) => {
      const next = Math.min(16, Math.max(0.25, v.zoom * (e.deltaY < 0 ? 1.15 : 0.87)))
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

  // 系统光标隐藏，由 overlay 画布的像素吸附光标替代（见 drawOverlayCursor）

  return (
    <div className="flex h-full flex-col">
      {/* 缩放工具条（纯图标，无文字干扰） */}
      <div className="flex shrink-0 items-center justify-end gap-1 border-b border-zinc-800 px-3 py-1.5">
        <button
          type="button"
          onClick={() => setView((v) => ({ ...v, zoom: Math.max(0.25, v.zoom / 1.25) }))}
          title="缩小"
          className="flex size-6 items-center justify-center rounded text-zinc-300 hover:bg-zinc-800"
        >
          <ZoomOut className="size-4" />
        </button>
        <span className="w-12 text-center text-xs text-zinc-400">{Math.round(view.zoom * 100)}%</span>
        <button
          type="button"
          onClick={() => setView((v) => ({ ...v, zoom: Math.min(16, v.zoom * 1.25) }))}
          title="放大"
          className="flex size-6 items-center justify-center rounded text-zinc-300 hover:bg-zinc-800"
        >
          <ZoomIn className="size-4" />
        </button>
        <button
          type="button"
          onClick={fit}
          title="适配画布"
          className="flex size-6 items-center justify-center rounded text-zinc-300 hover:bg-zinc-800"
        >
          <Maximize2 className="size-4" />
        </button>
      </div>

      {/* 画布区 */}
      <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden bg-checkerboard">
        <canvas
          ref={canvasRef}
          className="h-full w-full touch-none"
          style={{ cursor: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
        />
        {/* 像素吸附光标覆盖层：跟随鼠标/缩放/笔刷大小实时重绘 */}
        <canvas
          ref={overlayRef}
          className="pointer-events-none absolute inset-0 h-full w-full touch-none"
          aria-hidden
        />

      </div>
    </div>
  )
}
