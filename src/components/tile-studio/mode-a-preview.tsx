"use client"

import { useEffect, useRef, useState } from "react"
import { renderTile } from "@/lib/texture-generator"
import { renderDualTileArc } from "@/lib/dual-grid"
import { DUAL_GRID_16_ORDER } from "@/lib/quadrant-stitch"
import { HoverHelp } from "@/components/ui/hover-help"
import type { NeighborBits } from "@/lib/tile-mapping"
import type { GenParams } from "@/lib/types"

// 模式 B（图片切割）映射表 16 使用的位约定为 TL=8, TR=4, BL=2, BR=1，
// 而本组件的双网格渲染（renderDualTileArc）使用 TL=1, TR=2, BL=4, BR=8。
// 仅在预览显示时把 B 的 mask 转换为本组件的渲染约定，不动底层算法。
function bMaskToAMask(b: number): number {
  let a = 0
  if (b & 8) a |= 1 // TL
  if (b & 4) a |= 2 // TR
  if (b & 2) a |= 4 // BL
  if (b & 1) a |= 8 // BR
  return a
}

function gridBits(gridSize: number, cx: number, cy: number): NeighborBits {
  const has = (x: number, y: number) => x >= 0 && y >= 0 && x < gridSize && y < gridSize
  return {
    n: has(cx - 1, cy),
    ne: has(cx - 1, cy + 1),
    e: has(cx, cy + 1),
    se: has(cx + 1, cy + 1),
    s: has(cx + 1, cy),
    sw: has(cx + 1, cy - 1),
    w: has(cx, cy - 1),
    nw: has(cx - 1, cy - 1),
  }
}

function useDebouncedParams(params: GenParams, delay: number) {
  const [debounced, setDebounced] = useState(params)
  const lastKey = useRef(JSON.stringify(params))
  useEffect(() => {
    const key = JSON.stringify(params)
    if (key === lastKey.current) return
    lastKey.current = key
    const t = setTimeout(() => setDebounced(params), delay)
    return () => clearTimeout(t)
  }, [params, delay])
  return debounced
}

export function ModeAPreview({
  tileSize,
  params,
  mappingType,
  large = false,
}: {
  tileSize: number
  params: GenParams
  mappingType: "16" | "47"
  large?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const debouncedParams = useDebouncedParams(params, 120)

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const size = Math.max(16, tileSize)
    const ctx = el.getContext("2d", { willReadFrequently: true })
    if (!ctx) return
    ctx.imageSmoothingEnabled = false

    if (mappingType === "16") {
      // 16-tile 映射表（双网格算法）：展示 4×4 的全部 16 个瓦片
      const cols = 4
      const rows = 4
      el.width = cols * size
      el.height = rows * size
      ctx.clearRect(0, 0, el.width, el.height)
      // 使用与模式 B（图片切割）映射表 16 模板完全一致的排列顺序，便于对照
      for (let i = 0; i < DUAL_GRID_16_ORDER.length; i++) {
        const col = i % cols
        const row = Math.floor(i / cols)
        const tile = document.createElement("canvas")
        renderDualTileArc(tile, size, bMaskToAMask(DUAL_GRID_16_ORDER[i]), debouncedParams.color, "#8a6642", debouncedParams.erosionStrength, debouncedParams.edgeHighlight, debouncedParams.edgeThickness, debouncedParams.seed)
        ctx.drawImage(tile, col * size, row * size)
      }
    } else {
      // 47-tile 映射表（blob 算法）：展示 3×3 拼接示例
      const cols = 3
      const rows = 3
      el.width = cols * size
      el.height = rows * size
      ctx.clearRect(0, 0, el.width, el.height)
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const bits = gridBits(3, r, c)
          const tile = document.createElement("canvas")
          renderTile(tile, size, bits, debouncedParams, r * cols + c, true)
          ctx.drawImage(tile, c * size, r * size)
        }
      }
    }
  }, [tileSize, debouncedParams, mappingType])

  const isDual = mappingType === "16"

  return (
    <div className={large ? "flex h-full w-full flex-col overflow-hidden" : "rounded-lg border border-border bg-checkerboard p-2"}>
      <div className={large ? "mb-2 flex items-center justify-between" : "mb-1.5 flex items-center justify-between"}>
        <HoverHelp label={<span className="text-xs font-medium text-foreground">实时预览</span>}>
          <p className="mb-1 font-medium">实时预览</p>
          <p>拖动参数时画布会实时更新，随时可点击右上角「导出」保存图块集。</p>
        </HoverHelp>
        <span className="text-[11px] text-muted-foreground">
          {isDual ? "4×4 双网格全部 16 种 · 与模板一致" : "3×3 拼接示例"}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className={large ? "block max-h-full max-w-full" : "block w-full rounded-sm"}
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  )
}
