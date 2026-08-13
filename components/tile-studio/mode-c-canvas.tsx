"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useEditorStore } from "@/lib/store"
import type { DrawTool } from "@/lib/types"

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

const PALETTE = [
  "#4ade80", "#a3e635", "#60a5fa", "#f59e0b", "#a16207",
  "#78350f", "#64748b", "#e2e8f0", "#ef4444", "#000000",
]

interface RGBA {
  r: number
  g: number
  b: number
  a: number
}

function hexToRgba(hex: string): RGBA {
  const h = hex.replace("#", "")
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a: 255,
  }
}

function rgbaCss(c: RGBA): string {
  return `rgba(${c.r},${c.g},${c.b},${c.a / 255})`
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
  const setBaseCanvases = useEditorStore((s) => s.setBaseCanvases)
  const pushUndo = useEditorStore((s) => s.pushUndo)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)
  const canUndo = useEditorStore((s) => s.undoStack.length > 0)
  const canRedo = useEditorStore((s) => s.redoStack.length > 0)

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [view, setView] = useState({ zoom: 3, tx: 0, ty: 0 })
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [color, setColor] = useState<RGBA>(hexToRgba("#4ade80"))
  const [hover, setHover] = useState<{ sx: number; sy: number } | null>(null)

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

    if (blocksRef.current.length === 0) {
      ctx.fillStyle = "#94a3b8"
      ctx.font = "14px system-ui, sans-serif"
      ctx.textAlign = "center"
      ctx.fillText("尚无基础像素 — 在左侧「生成参数」面板点击「固化为像素」", w / 2, h / 2 - 8)
      ctx.fillText("之后即可在此手绘 5 块基础块，16/47 映射实时联动", w / 2, h / 2 + 14)
      return
    }

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

    if (hover) {
      ctx.strokeStyle = "rgba(250,204,21,0.95)"
      ctx.lineWidth = 1.5
      ctx.strokeRect(hover.sx + 0.5, hover.sy + 0.5, viewRef.current.zoom, viewRef.current.zoom)
    }
  }, [baseCanvases, view, hover, size, drawTileTransparent, drawTileColorDiff, drawShowGrid])

  // 键盘撤销/重做
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
    commitEdit(b, (data, w) => setPx(data, w, px, py, c, erase))
  }

  const pickColor = (b: Block, px: number, py: number) => {
    const ctx = b.canvas.getContext("2d", { willReadFrequently: true })!
    const d = ctx.getImageData(px, py, 1, 1).data
    setColor({ r: d[0], g: d[1], b: d[2], a: d[3] })
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

    // 一次笔触只压一次撤销栈
    if (!committedUndoRef.current) {
      pushUndo()
      committedUndoRef.current = true
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
    const b = blockAt(wx, wy)
    if (b) {
      const { px, py } = pixelAt(b, wx, wy)
      const { zoom, tx, ty } = viewRef.current
      setHover({ sx: (b.ox + px) * zoom + tx, sy: (b.oy + py) * zoom + ty })
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
    } else {
      setHover(null)
    }
  }

  const onPointerUp = () => {
    drawingRef.current = false
    committedUndoRef.current = false
    strokeRef.current = null
    panRef.current = null
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

  const cursor = drawTool === "picker" ? "copy" : drawTool === "fill" ? "cell" : "crosshair"

  return (
    <div className="flex h-full flex-col">
      {/* 颜色 / 缩放工具条 */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2">
        <div className="flex items-center gap-1">
          {PALETTE.map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => setColor(hexToRgba(hex))}
              className="size-5 rounded border border-black/30"
              style={{ background: hex }}
              aria-label={`颜色 ${hex}`}
            />
          ))}
          <input
            type="color"
            value={`#${color.r.toString(16).padStart(2, "0")}${color.g.toString(16).padStart(2, "0")}${color.b.toString(16).padStart(2, "0")}`}
            onChange={(e) => setColor(hexToRgba(e.target.value))}
            className="size-6 cursor-pointer rounded border border-zinc-700 bg-transparent"
            title="自定义颜色"
          />
          <span
            className="ml-1 inline-flex items-center gap-1 text-xs text-zinc-400"
            title="当前画笔颜色（橡皮为透明）"
          >
            <span className="inline-block size-3 rounded-sm border border-black/30" style={{ background: rgbaCss(color) }} />
            {color.a === 0 ? "透明" : `rgba(${color.r},${color.g},${color.b},${Math.round((color.a / 255) * 100)}%)`}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setView((v) => ({ ...v, zoom: Math.max(0.25, v.zoom / 1.25) }))}
            className="rounded border border-zinc-700 px-2 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            −
          </button>
          <span className="w-12 text-center text-xs text-zinc-400">{Math.round(view.zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setView((v) => ({ ...v, zoom: Math.min(16, v.zoom * 1.25) }))}
            className="rounded border border-zinc-700 px-2 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            ＋
          </button>
          <button
            type="button"
            onClick={fit}
            className="rounded border border-zinc-700 px-2 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            适配
          </button>
        </div>
      </div>

      {/* 画布区 */}
      <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden bg-checkerboard">
        <canvas
          ref={canvasRef}
          className="h-full w-full touch-none"
          style={{ cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
        <div className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-zinc-400">
          滚轮缩放 · 中键/右键拖拽平移 · Ctrl+Z 撤销 · Ctrl+Shift+Z 重做 · 越界像素自动回绕（∞ 通透开启时可见 8 副本）
        </div>
      </div>
    </div>
  )
}
