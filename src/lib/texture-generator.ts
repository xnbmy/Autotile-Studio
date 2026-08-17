import type { NeighborBits } from "./tile-mapping"
import { hashSeed, mulberry32 } from "./prng"
import type { GenParams } from "./types"

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "")
  const bigint = Number.parseInt(
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean,
    16,
  )
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255]
}

export function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")
}

export function lighten([r, g, b]: [number, number, number], amount: number): [number, number, number] {
  return [r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount]
}
export function darken([r, g, b]: [number, number, number], amount: number): [number, number, number] {
  return [r * (1 - amount), g * (1 - amount), b * (1 - amount)]
}

/**
 * 到最近透明像素的 4 连通距离场。两遍扫描（forward + backward），
 * 复杂度 O(size²)。边缘像素（紧邻透明）距离为 1，向内递增。
 */
export function distanceToEdge(alpha: Uint8ClampedArray, size: number): Int32Array {
  const INF = size * size
  const dist = new Int32Array(size * size).fill(INF)
  const idx = (x: number, y: number) => y * size + x
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = idx(x, y)
      if (alpha[i] === 0) {
        dist[i] = 0
        continue
      }
      let best = INF
      if (x > 0) best = Math.min(best, dist[i - 1] + 1)
      if (y > 0) best = Math.min(best, dist[i - size] + 1)
      dist[i] = best
    }
  }
  for (let y = size - 1; y >= 0; y--) {
    for (let x = size - 1; x >= 0; x--) {
      const i = idx(x, y)
      if (dist[i] === 0) continue
      if (x < size - 1) dist[i] = Math.min(dist[i], dist[i + 1] + 1)
      if (y < size - 1) dist[i] = Math.min(dist[i], dist[i + size] + 1)
    }
  }
  // Int32Array：距离可能超过 255（无透明像素时为 INF=size*size），
  // 用 Uint8Array 会被截断成 0，导致整块被误判为边缘阴影。
  return dist
}

/**
 * Renders a single autotile variant into `canvas` for the given neighbor
 * presence bits, respecting the current edge-style / erosion parameters.
 * `maskKey` seeds a deterministic per-tile RNG so regenerating with the same
 * seed always reproduces the same eroded silhouette.
 */
export function renderTile(
  canvas: HTMLCanvasElement,
  size: number,
  bits: NeighborBits,
  params: GenParams,
  maskKey: number,
  supportsDiagonals = true,
) {
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return
  ctx.clearRect(0, 0, size, size)

  const alpha = new Uint8ClampedArray(size * size).fill(255)
  const idx = (x: number, y: number) => y * size + x
  const baseDepth = Math.max(1, Math.round(params.edgeThickness))
  const maxDepth = size
  const amp = params.erosionStrength

  function depthAt(offset: number, edgeLen: number, salt: number) {
    // 逐像素采样（step=1）+ 噪声幅度与 16 双网格算法（renderDualTileArc）匹配：
    // 16 的边界扰动约 ±amp*edgeThick，这里用 baseDepth*3.2 让颗粒感相近。
    const stepped = offset
    const r = mulberry32(hashSeed(params.seed, maskKey, salt, stepped))()
    const d = baseDepth + Math.round(r * amp * baseDepth * 3.2)
    return Math.max(0, Math.min(maxDepth, d))
  }

  if (!bits.n) for (let x = 0; x < size; x++) { const d = depthAt(x, size, 1); for (let y = 0; y < d; y++) alpha[idx(x, y)] = 0 }
  if (!bits.s) for (let x = 0; x < size; x++) { const d = depthAt(x, size, 2); for (let y = 0; y < d; y++) alpha[idx(x, size - 1 - y)] = 0 }
  if (!bits.w) for (let y = 0; y < size; y++) { const d = depthAt(y, size, 3); for (let x = 0; x < d; x++) alpha[idx(x, y)] = 0 }
  if (!bits.e) for (let y = 0; y < size; y++) { const d = depthAt(y, size, 4); for (let x = 0; x < d; x++) alpha[idx(size - 1 - x, y)] = 0 }

  function carveCorner(cx: number, cy: number, signX: number, signY: number, salt: number) {
    const baseRadius = baseDepth * 1.7
    const span = Math.ceil(baseRadius) + 3
    for (let y = 0; y < span; y++) {
      for (let x = 0; x < span; x++) {
        const px = cx + signX * x
        const py = cy + signY * y
        if (px < 0 || py < 0 || px >= size || py >= size) continue
        const n = (mulberry32(hashSeed(params.seed, maskKey, salt, x, y))() - 0.5) * amp * baseDepth * 2.4
        const r = baseRadius + n
        const dist = Math.sqrt(x * x + y * y)
        if (dist < r) alpha[idx(px, py)] = 0
      }
    }
  }

  if (supportsDiagonals) {
    if (bits.n && bits.e && !bits.ne) carveCorner(size - 1, 0, -1, 1, 10)
    if (bits.s && bits.e && !bits.se) carveCorner(size - 1, size - 1, -1, -1, 11)
    if (bits.s && bits.w && !bits.sw) carveCorner(0, size - 1, 1, -1, 12)
    if (bits.n && bits.w && !bits.nw) carveCorner(0, 0, 1, 1, 13)
  }

  colorizeAlpha(ctx, alpha, size, params)
}

/** 按 alpha 场着色（草色 + 边缘阴影/高光带），renderTile 与 renderBlob5Asset 共用 */
export function colorizeAlpha(
  ctx: CanvasRenderingContext2D,
  alpha: Uint8ClampedArray,
  size: number,
  params: GenParams,
) {
  const img = ctx.createImageData(size, size)
  const rgb = hexToRgb(params.color)

  // 边缘高光：与 16 双网格算法统一的阴影带 + 高光带。
  // 0 = 关闭（纯色平铺），>0 时根据到边缘的距离渐变绘制暗边与亮边，
  // 让腐蚀后的轮廓不再是一圈单调的纯色硬边。
  const hl = Math.max(0, Math.min(1, Number.isFinite(params.edgeHighlight) ? params.edgeHighlight : 0.5))
  const shadow = darken(rgb, 0.28 * hl)
  const rim = lighten(rgb, 0.4 * hl)
  // 边缘带宽度随瓦片尺寸缩放，保持与 16 算法相近的视觉比例
  const rimW = Math.max(1, Math.round(size / 14))
  // 腐蚀噪声让轮廓参差，距离场基于最终 alpha 计算，边缘带会贴合实际轮廓
  const dist = hl > 0 ? distanceToEdge(alpha, size) : null

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const a = alpha[i]
      const o = i * 4
      if (a === 0) {
        img.data[o + 3] = 0
        continue
      }
      let [r, g, b] = rgb
      if (dist) {
        const d = dist[i]
        if (d <= rimW) {
          ;[r, g, b] = shadow
        } else if (d <= rimW * 2) {
          ;[r, g, b] = rim
        }
        // 中间本色保持纯色：阴影/高光带只存在于腐蚀边缘附近，不影响中间色块
      }
      img.data[o] = Math.round(r)
      img.data[o + 1] = Math.round(g)
      img.data[o + 2] = Math.round(b)
      img.data[o + 3] = a
    }
  }
  ctx.putImageData(img, 0, 0)
}

/**
 * 渲染 47 模式的 5 类基础素材（整块 size，与手绘/固化朝向基准一致）。
 * 2×2 量化形状：outer=0010 草左下、inner=1011 凹口右上、edge=0011 草下半、
 * solid=1111、empty=0000。草/背景分界线固定在 size/2（±噪声腐蚀），
 * 保证 1/4 步进偏移拼合时各象限边界严格对齐。
 */
export function renderBlob5Asset(
  canvas: HTMLCanvasElement,
  size: number,
  kind: "outer" | "inner" | "edge" | "solid" | "empty",
  params: GenParams,
) {
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return
  ctx.clearRect(0, 0, size, size)
  if (kind === "empty") return
  if (kind === "solid") {
    renderTile(canvas, size, { n: true, ne: true, e: true, se: true, s: true, sw: true, w: true, nw: true }, params, 255, true)
    return
  }

  const m = size / 2
  const amp = params.erosionStrength
  const base = Math.max(1, Math.round(params.edgeThickness))
  const alpha = new Uint8ClampedArray(size * size).fill(255)
  const idx = (x: number, y: number) => y * size + x
  const jitter = (salt: number, v: number) => {
    const r = mulberry32(hashSeed(params.seed, salt, v))()
    return Math.round((r - 0.5) * 2 * amp * base * 1.6)
  }
  const hLine = new Int32Array(size)
  for (let x = 0; x < size; x++) hLine[x] = m + jitter(30, x)
  const vLine = new Int32Array(size)
  for (let y = 0; y < size; y++) vLine[y] = m + jitter(31, y)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const grass =
        kind === "edge"
          ? y >= hLine[x]
          : kind === "outer"
            ? x < vLine[y] && y >= hLine[x]
            : x < vLine[y] || y >= hLine[x]
      if (!grass) alpha[idx(x, y)] = 0
    }
  }

  if (kind !== "edge") {
    // 角部圆润化：outer 草尖 / inner 凹口的角点均在 (m,m)，向草侧（左下）挖噪声圆
    const baseRadius = base * 1.7
    const span = Math.ceil(baseRadius) + 3
    for (let y = 0; y < span; y++) {
      for (let x = 0; x < span; x++) {
        const px = m - x
        const py = m + y
        if (px < 0 || py < 0 || px >= size || py >= size) continue
        const n = (mulberry32(hashSeed(params.seed, 32, x, y))() - 0.5) * amp * base * 2.4
        if (Math.sqrt(x * x + y * y) < baseRadius + n) alpha[idx(px, py)] = 0
      }
    }
  }

  colorizeAlpha(ctx, alpha, size, params)
}
