"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useEditorStore } from "@/lib/store"
import { deriveTilesFromBase, DUAL_GRID_16_ORDER } from "@/lib/quadrant-stitch"
import { BLOB_STANDARD_ORDER, BLOB_STANDARD_COLUMNS } from "@/lib/tile-mapping"
import { renderDualTileArc } from "@/lib/dual-grid"

/* ─────────────────────────────────────────────────────────────
 * P2.6 总览：消费 deriveTilesFromBase 实时派生瓦片。
 * baseCanvases 每次编辑 → 派生 Map 重算 → 毫秒级刷新。
 * 16 模式预览与参数化生成实时预览（ModeAPreview）一致：直接用
 * renderDualTileArc 按 genParams 渲染，而非从基础块拼合。
 * 交互：滚轮以鼠标为中心缩放，按住中键/右键拖拽平移。
 * ───────────────────────────────────────────────────────────── */

/** 把双网格 mask 的位约定（B 模式 TL=8,TR=4,BL=2,BR=1）转为 renderDualTileArc 约定（TL=1,TR=2,BL=4,BR=8） */
function bMaskToAMask(b: number): number {
  let a = 0
  if (b & 8) a |= 1 // TL
  if (b & 4) a |= 2 // TR
  if (b & 2) a |= 4 // BL
  if (b & 1) a |= 8 // BR
  return a
}

function useDerivedTiles() {
  const baseCanvases = useEditorStore((s) => s.baseCanvases)
  const mappingType = useEditorStore((s) => s.mappingType)
  const tileSize = useEditorStore((s) => s.tileSize)
  const genParams = useEditorStore((s) => s.genParams)
  return useMemo(() => {
    if (mappingType === "16") {
      // 与 ModeAPreview 实时预览一致：renderDualTileArc 按 genParams 渲染 4×4 全部 16 种
      const size = Math.max(16, Math.round(tileSize))
      const map = new Map<number, HTMLCanvasElement>()
      for (const mask of DUAL_GRID_16_ORDER) {
        const tc = document.createElement("canvas")
        renderDualTileArc(tc, size, bMaskToAMask(mask), genParams.color, "#8a6642", genParams.erosionStrength, genParams.edgeHighlight, genParams.edgeThickness, genParams.seed)
        map.set(mask, tc)
      }
      return map
    }
    return deriveTilesFromBase(baseCanvases, mappingType, tileSize)
  }, [baseCanvases, mappingType, tileSize, genParams])
}

interface View {
  zoom: number
  tx: number
  ty: number
}

export function ModeCOverview() {
  const tiles = useDerivedTiles()
  const mappingType = useEditorStore((s) => s.mappingType)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState<View>({ zoom: 1, tx: 0, ty: 0 })
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const interactedRef = useRef(false)

  // 容器尺寸跟踪
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => setSize({ w: wrap.clientWidth, h: wrap.clientHeight }))
    ro.observe(wrap)
    setSize({ w: wrap.clientWidth, h: wrap.clientHeight })
    return () => ro.disconnect()
  }, [])

  // 自适应视图：瓦片网格整体居中
  const fitView = useCallback(
    (w: number, h: number) => {
      if (w <= 0 || h <= 0) return
      const first = (mappingType === "16" ? DUAL_GRID_16_ORDER : BLOB_STANDARD_ORDER).find(
        (m): m is number => m !== null && tiles.has(m),
      )
      const t = first !== undefined ? tiles.get(first) : undefined
      if (!t) return
      const cols = mappingType === "16" ? 4 : BLOB_STANDARD_COLUMNS
      const order = mappingType === "16" ? DUAL_GRID_16_ORDER : BLOB_STANDARD_ORDER
      const gap = 8
      const pad = 10
      const labelH = 14
      const rows = Math.ceil(order.length / cols)
      const contentW = pad * 2 + cols * t.width + (cols - 1) * gap
      const contentH = pad * 2 + rows * (t.width + labelH) + (rows - 1) * gap
      const zoom = Math.max(0.1, Math.min(1, (w - 8) / contentW, (h - 8) / contentH))
      setView({
        zoom,
        tx: Math.round((w - contentW * zoom) / 2),
        ty: Math.round((h - contentH * zoom) / 2),
      })
    },
    [tiles, mappingType],
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
    const ctx = cv.getContext("2d")
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)
    ctx.imageSmoothingEnabled = false

    if (tiles.size === 0) {
      ctx.fillStyle = "#94a3b8"
      ctx.font = "14px system-ui, sans-serif"
      ctx.textAlign = "center"
      ctx.fillText("尚无基础像素 — 先在「手绘」页签绘制或「固化为像素」", size.w / 2, size.h / 2)
      return
    }

    const order = mappingType === "16" ? DUAL_GRID_16_ORDER : BLOB_STANDARD_ORDER
    const cols = mappingType === "16" ? 4 : BLOB_STANDARD_COLUMNS
    const first = order.find((m): m is number => m !== null && tiles.has(m))
    const t = first !== undefined ? tiles.get(first) : undefined
    const tSize = t ? t.width : 0
    if (tSize === 0) return
    const gap = 8
    const pad = 10
    const labelH = 14
    const rows = Math.ceil(order.length / cols)
    const { zoom, tx, ty } = view
    const sc = tSize * zoom
    const labelSc = 11 * zoom

    ctx.font = "11px ui-monospace, monospace"
    ctx.textAlign = "center"
    order.forEach((mask, i) => {
      if (mask === null) return
      const tile = tiles.get(mask)
      if (!tile) return
      const cx = tx + (pad + (i % cols) * (tSize + gap)) * zoom
      const cy = ty + (pad + Math.floor(i / cols) * (tSize + labelH + gap)) * zoom
      ctx.drawImage(tile, cx, cy, sc, sc)
      ctx.fillStyle = "rgba(15,23,42,0.8)"
      ctx.fillText(String(mask), cx + sc / 2, cy + sc + labelSc)
    })
  }, [tiles, mappingType, size, view])

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

  // 拖拽平移（中键 / 右键）
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) {
      interactedRef.current = true
      panRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = panRef.current
    if (!p) return
    setView((v) => ({ ...v, tx: p.tx + (e.clientX - p.x), ty: p.ty + (e.clientY - p.y) }))
  }
  const onPointerUp = () => {
    panRef.current = null
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-zinc-800 px-3 py-1.5 text-xs text-zinc-400">
        {mappingType === "16" ? "16 模式" : "47 模式"}全部瓦片 · {tiles.size} 张 · 像素级实时派生
      </div>
      <div ref={wrapRef} className="relative min-h-0 flex-1 bg-checkerboard">
        <canvas
          ref={canvasRef}
          className="h-full w-full touch-none"
          style={{ cursor: panRef.current ? "grabbing" : "grab" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
        <div className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-zinc-400">
          滚轮以鼠标为中心缩放 · 中键/右键拖拽平移
        </div>
      </div>
    </div>
  )
}
