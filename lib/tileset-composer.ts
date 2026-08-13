export interface SheetLayoutOptions {
  tileSize: number
  columns: number
  margin: number
  spacingX: number
  spacingY: number
}

export interface SheetResult {
  canvas: HTMLCanvasElement
  width: number
  height: number
  columns: number
  rows: number
  positions: Map<number, { x: number; y: number; col: number; row: number }>
}

/** Lays out an ordered list of pre-rendered tile canvases into one sheet canvas.
 *  Pass `null` for a canvas to leave that cell blank (transparent) while preserving layout.
 *  spacingX/spacingY 分别为相邻图块之间的横向/纵向间距。 */
export function composeSheet(orderedTiles: { key: number; canvas: HTMLCanvasElement | null }[], opts: SheetLayoutOptions): SheetResult {
  const columns = Math.max(1, opts.columns)
  const rows = Math.max(1, Math.ceil(orderedTiles.length / columns))
  const spacingX = Math.max(0, opts.spacingX)
  const spacingY = Math.max(0, opts.spacingY)
  const width = opts.margin * 2 + columns * opts.tileSize + Math.max(0, columns - 1) * spacingX
  const height = opts.margin * 2 + rows * opts.tileSize + Math.max(0, rows - 1) * spacingY
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (ctx) ctx.imageSmoothingEnabled = false
  const positions = new Map<number, { x: number; y: number; col: number; row: number }>()
  orderedTiles.forEach((t, i) => {
    const col = i % columns
    const row = Math.floor(i / columns)
    const x = opts.margin + col * (opts.tileSize + spacingX)
    const y = opts.margin + row * (opts.tileSize + spacingY)
    if (t.canvas) {
      ctx?.drawImage(t.canvas, x, y, opts.tileSize, opts.tileSize)
      positions.set(t.key, { x, y, col, row })
    }
  })
  return { canvas, width, height, columns, rows, positions }
}

export function canvasToDataURL(canvas: HTMLCanvasElement) {
  return canvas.toDataURL("image/png")
}
