export function lineCells(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const cells: [number, number][] = []
  let x = x0
  let y = y0
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x1 > x0 ? 1 : -1
  const sy = y1 > y0 ? 1 : -1
  let err = dx - dy
  while (true) {
    cells.push([x, y])
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x += sx
    }
    if (e2 < dx) {
      err += dx
      y += sy
    }
  }
  return cells
}

export function circleCells(cx: number, cy: number, radius: number): [number, number][] {
  const cells: [number, number][] = []
  const r2 = radius * radius
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      if (x * x + y * y <= r2) cells.push([cx + x, cy + y])
    }
  }
  return cells
}
