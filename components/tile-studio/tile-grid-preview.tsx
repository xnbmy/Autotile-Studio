"use client"

import { useEffect, useRef } from "react"

/** Renders a small grid of pre-rendered tile canvases (used for thumbnails / mapping-table previews). */
export function TileGridPreview({
  tiles,
  order,
  columns,
  cellSize = 28,
}: {
  tiles: Map<number, HTMLCanvasElement>
  order: number[]
  columns: number
  cellSize?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={containerRef}
      className="grid gap-0.5 rounded-md bg-checkerboard p-1"
      style={{ gridTemplateColumns: `repeat(${columns}, ${cellSize}px)` }}
    >
      {order.map((key) => (
        <TileCell key={key} canvas={tiles.get(key)} size={cellSize} />
      ))}
    </div>
  )
}

function TileCell({ canvas, size }: { canvas?: HTMLCanvasElement; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!ref.current || !canvas) return
    const ctx = ref.current.getContext("2d", { willReadFrequently: true })
    if (!ctx) return
    ref.current.width = size
    ref.current.height = size
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, size, size)
    ctx.drawImage(canvas, 0, 0, size, size)
  }, [canvas, size])
  return <canvas ref={ref} width={size} height={size} className="rounded-[2px]" style={{ imageRendering: "pixelated" }} />
}
