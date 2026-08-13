import { distanceToEdge, hexToRgb } from "./texture-generator"
import { mulberry32, hashSeed } from "./prng"

export interface CornerMask {
  tl: boolean
  tr: boolean
  bl: boolean
  br: boolean
}

export function cornerMaskIndex(c: CornerMask) {
  return (c.tl ? 1 : 0) | (c.tr ? 2 : 0) | (c.bl ? 4 : 0) | (c.br ? 8 : 0)
}

export const DUAL_MASK_LIST = Array.from({ length: 16 }, (_, i) => i)
export const DUAL_COLUMNS = 4

// 1.1 0000, 1.2 0001, 1.3 0110, 1.4 1000,
// 2.1 0010, 2.2 0101, 2.3 1011, 2.4 0011,
// 3.1 1001, 3.2 0111, 3.3 1111, 3.4 1110,
// 4.1 0100, 4.2 1100, 4.3 1101, 4.4 1010
export const DUAL_STANDARD_ORDER = [0, 8, 6, 1, 4, 10, 13, 12, 9, 14, 15, 7, 2, 3, 11, 5]

function indexToCorners(i: number): CornerMask {
  return { tl: !!(i & 1), tr: !!(i & 2), bl: !!(i & 4), br: !!(i & 8) }
}

const DITHER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]

export function renderDualTile(canvas: HTMLCanvasElement, size: number, maskIndex: number, grassColor: string, dirtColor: string, gradient: boolean) {
  const corners = indexToCorners(maskIndex)
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  ctx.clearRect(0, 0, size, size)
  const grass = hexToRgb(grassColor)
  const img = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size
      const weight =
        (corners.tl ? 1 : 0) * (1 - u) * (1 - v) +
        (corners.tr ? 1 : 0) * u * (1 - v) +
        (corners.bl ? 1 : 0) * (1 - u) * v +
        (corners.br ? 1 : 0) * u * v
      let blendT: number
      if (gradient) {
        blendT = Math.max(0, Math.min(1, (weight - 0.3) / 0.4))
      } else {
        const dm = DITHER[y % 4][x % 4] / 16
        blendT = weight > dm ? 1 : 0
      }
      const o = (y * size + x) * 4
      img.data[o] = grass[0]
      img.data[o + 1] = grass[1]
      img.data[o + 2] = grass[2]
      img.data[o + 3] = Math.round(blendT * 255)
    }
  }
  ctx.putImageData(img, 0, 0)
}

function lighten([r, g, b]: [number, number, number], amount: number): [number, number, number] {
  return [r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount]
}
function darken([r, g, b]: [number, number, number], amount: number): [number, number, number] {
  return [r * (1 - amount), g * (1 - amount), b * (1 - amount)]
}

/**
 * Pixel-art dual-grid tile with eroded arc edges.
 *
 * Geometry (verified against reference):
 *   - 0 grass corners  -> fully transparent
 *   - 1 grass corner   -> single quarter-disc sector (convex bump)
 *   - 2 adjacent grass -> half tile (fill then erase 2 adjacent dirt sectors)
 *   - 2 diagonal grass -> S-curve band connecting the two corners through the
 *                         tile centre (fill then erase 2 diagonal dirt sectors)
 *   - 3 grass corners  -> full tile minus one concave quarter-disc notch
 *   - 4 grass corners  -> full tile
 *
 * All arcs are pixel-by-pixel (ImageData) with zero anti-aliasing. Deterministic
 * erosion noise jags the silhouette for a natural terrain feel. A distance field
 * over the eroded silhouette drives the shading: dark shadow band at the outer
 * edge, light highlight rim inside it, plain base colour in the middle. Because
 * shading is distance-based, the bands follow the jagged eroded edge (eroded
 * highlight) and never leak into the interior fill colour.
 */
export function renderDualTileArc(
  canvas: HTMLCanvasElement,
  size: number,
  maskIndex: number,
  grassColor: string,
  dirtColor: string,
  erosionStrength = 0.55,
  edgeHighlight = 1,
  edgeThickness = 2,
  seed = 12345,
) {
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  ctx.clearRect(0, 0, size, size)

  if (maskIndex === 0) return

  const grass = hexToRgb(grassColor)
  const hl = Math.max(0, Math.min(1, edgeHighlight))
  const rim = lighten(grass, 0.4 * hl)
  const shadow = darken(grass, 0.28 * hl)
  const img = ctx.createImageData(size, size)

  const R = size / 2
  const tl = !!(maskIndex & 1)
  const tr = !!(maskIndex & 2)
  const bl = !!(maskIndex & 4)
  const br = !!(maskIndex & 8)
  const grassCount = (tl ? 1 : 0) + (tr ? 1 : 0) + (bl ? 1 : 0) + (br ? 1 : 0)

  // Corner positions
  const CORNERS: Array<{ on: boolean; cx: number; cy: number }> = [
    { on: tl, cx: 0, cy: 0 },
    { on: tr, cx: size, cy: 0 },
    { on: bl, cx: 0, cy: size },
    { on: br, cx: size, cy: size },
  ]

  // Erosion / shading parameters.
  // 与 47 模式 renderTile 的参数语义统一：
  //  - edgeThickness 控制基础边缘厚度（0 附近 = 边界清晰，越大腐蚀带越宽）
  //  - erosionStrength (0..1) 驱动噪声幅度
  //  - seed 控制噪声确定性（同 seed + 同 mask 产出同一形状）
  const amp = Math.max(0, Math.min(1, erosionStrength))
  const edgeThick = Math.max(0.5, edgeThickness + Math.round(size / 12) * amp)
  const rimW = Math.max(1, Math.round(size / 14))
  const rng = mulberry32(hashSeed(seed, maskIndex, size))

  // Determine edge type
  const isDiag = (tl && br) || (tr && bl)
  const isAdjacent = grassCount === 2 && !isDiag

  // Roundness: 0 = sharp square, 1 = perfect circle. ~0.5 gives a rounded-square
  // look (blocky with softened corners, matching typical pixel-art terrain tiles).
  const ROUNDNESS = 0.48

  function cornerDist(dx: number, dy: number): number {
    const circle = Math.sqrt(dx * dx + dy * dy)
    const square = Math.max(Math.abs(dx), Math.abs(dy))
    return square * (1 - ROUNDNESS) + circle * ROUNDNESS
  }

  // Signed distance to the grass/dirt boundary (>0 = inside grass).
  function signedDist(x: number, y: number): number {
    if (grassCount === 4) return R
    if (grassCount === 1) {
      // Single convex corner: rounded-square quarter-sector
      const gc = CORNERS.find((c) => c.on)!
      return R - cornerDist(x - gc.cx, y - gc.cy)
    }
    if (grassCount === 2 && isAdjacent) {
      // Flat edge: half-rectangle with a straight boundary along the tile midline.
      // The outer corners (grass side) are square; the transition to the straight
      // edge is handled by neighbouring convex/concave tiles at assembly time.
      if (tl && tr) return R - y         // top edge (mask 3): y < R
      if (bl && br) return y - R         // bottom edge (mask 12): y > R
      if (tl && bl) return R - x         // left edge (mask 5): x < R
      /* tr && br */ return x - R        // right edge (mask 10): x > R
    }
    // 2 diagonal (S-curve band) or 3 grass (concave notch): fill tile, erase
    // rounded-square quarter-sectors at each dirt corner.
    let best = Infinity
    for (const c of CORNERS) {
      if (c.on) continue
      const d = cornerDist(x - c.cx, y - c.cy)
      const sd = d - R
      if (sd < best) best = sd
    }
    return best
  }

  // 1. 腐蚀轮廓（silhouette）：噪声只决定像素是否属于色块
  const alpha = new Uint8ClampedArray(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5
      const py = y + 0.5
      const baseSd = signedDist(px, py)
      let inside = baseSd > 0
      if (Math.abs(baseSd) < edgeThick) {
        const n = (rng() - 0.5) * amp * edgeThick * 2
        inside = baseSd + n > 0
      }
      alpha[y * size + x] = inside ? 255 : 0
    }
  }

  // 2. 基于腐蚀后轮廓的距离场：阴影带/高光带贴合参差边缘（高光也有腐蚀感）
  const dist = hl > 0 ? distanceToEdge(alpha, size) : null

  // 3. 着色：外沿暗边 → 内沿亮边 → 中间本色（纯色，不受高光影响）
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const o = i * 4
      const a = alpha[i]
      if (a === 0) {
        img.data[o] = 0; img.data[o + 1] = 0; img.data[o + 2] = 0; img.data[o + 3] = 0
        continue
      }
      let [r, g, b] = grass
      if (dist) {
        const d = dist[i]
        if (d <= rimW) { [r, g, b] = shadow }       // 外沿暗边
        else if (d <= rimW * 2) { [r, g, b] = rim } // 内沿亮边
        // 中间本色保持纯色，不受高光影响
      }
      img.data[o] = Math.round(r)
      img.data[o + 1] = Math.round(g)
      img.data[o + 2] = Math.round(b)
      img.data[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}
