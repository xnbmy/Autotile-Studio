/**
 * 图像预处理 · 像素化降采样算法
 * 参照「自然像素化实验室 V3」实现：中值切割自适应调色板 + 块平均重采样
 * + 亮度优先感知匹配 + Bayer 抖动 + Despeckle 去噪 + 暗部提亮/对比度。
 * 全部基于 ImageData 像素级处理，符合项目像素风格约定（无抗锯齿）。
 */

export interface PreprocessParams {
  targetW: number
  targetH: number
  colorCount: number // 调色板颜色数（4~64）
  smoothRadius: number // Kuwahara 平滑（0~4，本实现简化为中值平滑）
  ditherStrength: number // Bayer 抖动强度 0~1
  shadowBoost: number // 暗部细节提亮 0~1
  contrast: number // 对比度 -50~50
  enableDespeckle: boolean // 消除单像素杂点
}

export const DEFAULT_PREPROCESS: PreprocessParams = {
  targetW: 64,
  targetH: 64,
  colorCount: 16,
  smoothRadius: 1,
  ditherStrength: 0,
  shadowBoost: 0.2,
  contrast: 20,
  enableDespeckle: true,
}

const BAYER_4X4 = [
  [0 / 16, 8 / 16, 2 / 16, 10 / 16],
  [12 / 16, 4 / 16, 14 / 16, 6 / 16],
  [3 / 16, 11 / 16, 1 / 16, 9 / 16],
  [15 / 16, 7 / 16, 13 / 16, 5 / 16],
].map((row) => row.map((v) => v - 0.5))

// ── ColorBox：中值切割聚类 ────────────────────────────────────────────────
class ColorBox {
  pixels: number[][]
  rMin = 255; rMax = 0
  gMin = 255; gMax = 0
  bMin = 255; bMax = 0

  constructor(pixels: number[][]) {
    this.pixels = pixels
    this.calcBounds()
  }
  private calcBounds() {
    const p = this.pixels
    for (let i = 0; i < p.length; i++) {
      const c = p[i]
      if (c[0] < this.rMin) this.rMin = c[0]
      if (c[0] > this.rMax) this.rMax = c[0]
      if (c[1] < this.gMin) this.gMin = c[1]
      if (c[1] > this.gMax) this.gMax = c[1]
      if (c[2] < this.bMin) this.bMin = c[2]
      if (c[2] > this.bMax) this.bMax = c[2]
    }
  }
  getWidestChannel(): number {
    const r = this.rMax - this.rMin
    const g = this.gMax - this.gMin
    const b = this.bMax - this.bMin
    if (r >= g && r >= b) return 0
    if (g >= r && g >= b) return 1
    return 2
  }
  split(): [ColorBox, ColorBox] {
    if (this.pixels.length <= 1) return [this, this]
    const ch = this.getWidestChannel()
    this.pixels.sort((a, b) => a[ch] - b[ch])
    const mid = Math.floor(this.pixels.length / 2)
    return [new ColorBox(this.pixels.slice(0, mid)), new ColorBox(this.pixels.slice(mid))]
  }
  getAvgColor(): [number, number, number] {
    let r = 0, g = 0, b = 0
    for (let i = 0; i < this.pixels.length; i++) {
      r += this.pixels[i][0]
      g += this.pixels[i][1]
      b += this.pixels[i][2]
    }
    const len = this.pixels.length || 1
    return [Math.round(r / len), Math.round(g / len), Math.round(b / len)]
  }
}

/** 中值切割：从采样像素提取 maxColors 个代表色 */
export function medianCut(pixelSample: number[][], maxColors: number): [number, number, number][] {
  let boxes: ColorBox[] = [new ColorBox(pixelSample)]
  while (boxes.length < maxColors) {
    let splittable = false
    boxes.sort((a, b) => b.pixels.length - a.pixels.length)
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].pixels.length > 1) {
        const [b1, b2] = boxes[i].split()
        boxes.splice(i, 1, b1, b2)
        splittable = true
        break
      }
    }
    if (!splittable) break
  }
  return boxes.map((b) => b.getAvgColor())
}

/** 亮度优先感知匹配：找最接近的调色板色下标 */
function findClosestColorLuma(r: number, g: number, b: number, palette: [number, number, number][]): number {
  let minDist = Infinity
  let bestIdx = 0
  const y1 = 0.299 * r + 0.587 * g + 0.114 * b
  for (let i = 0; i < palette.length; i++) {
    const pr = palette[i][0], pg = palette[i][1], pb = palette[i][2]
    const y2 = 0.299 * pr + 0.587 * pg + 0.114 * pb
    const dy = y1 - y2
    const dr = r - pr, dg = g - pg, db = b - pb
    const dist = dy * dy * 3.0 + dr * dr * 0.3 + dg * dg * 0.5 + db * db * 0.2
    if (dist < minDist) {
      minDist = dist
      bestIdx = i
    }
  }
  return bestIdx
}

/** 消除单像素杂点：若上下左右四邻同色且与中心不同，则中心替换为邻色 */
function despeckleGrid(grid: Int32Array, gw: number, gh: number) {
  for (let y = 1; y < gh - 1; y++) {
    for (let x = 1; x < gw - 1; x++) {
      const center = grid[y * gw + x]
      if (center < 0) continue
      const n0 = grid[(y - 1) * gw + x]
      const n1 = grid[(y + 1) * gw + x]
      const n2 = grid[y * gw + (x - 1)]
      const n3 = grid[y * gw + (x + 1)]
      if (n0 === n1 && n1 === n2 && n2 === n3 && n0 !== center && n0 >= 0) {
        grid[y * gw + x] = n0
      }
    }
  }
}

/**
 * 量化网格中值平滑（r=0 时返回原网格）。
 * 在目标分辨率（targetW×targetH）的调色板索引网格上做中值，而非源分辨率 RGB——
 * 像素数少约 40 倍，且索引范围仅 0~maxColor，用计数法取中值取代每次 sort，
 * 显著降低滑块拖动的卡顿。
 */
function smoothGrid(grid: Int32Array, gw: number, gh: number, radius: number, maxColor: number) {
  if (radius <= 0) return
  const out = new Int32Array(grid)
  const hist = new Int32Array(maxColor + 1)
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const idx = y * gw + x
      if (grid[idx] < 0) {
        out[idx] = -1
        continue
      }
      hist.fill(0)
      let cnt = 0
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = Math.min(gw - 1, Math.max(0, x + dx))
          const ny = Math.min(gh - 1, Math.max(0, y + dy))
          const v = grid[ny * gw + nx]
          if (v >= 0) {
            hist[v]++
            cnt++
          }
        }
      }
      // 遍历直方图累计取中值
      let t = 0
      for (let c = 0; c <= maxColor; c++) {
        t += hist[c]
        if (t > Math.floor(cnt / 2)) {
          out[idx] = c
          break
        }
      }
    }
  }
  grid.set(out)
}

/**
 * 像素化降采样主流程：返回目标尺寸的 ImageData。
 * @param src 源图 ImageData（完整尺寸）
 * @param params 预处理参数
 */
export function pixelDownsample(src: ImageData, params: PreprocessParams): ImageData {
  const { targetW, targetH, colorCount, smoothRadius, ditherStrength, shadowBoost, contrast, enableDespeckle } = params
  const srcW = src.width
  const srcH = src.height

  // 1. 暗部提亮 + 对比度（作用于当前分辨率的数据）
  let data = src.data
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast))
  const preData = new Uint8ClampedArray(data) // 先拷贝，避免污染源
  const sampledPixels: number[][] = []
  for (let i = 0; i < preData.length; i += 4) {
    let r = preData[i], g = preData[i + 1], b = preData[i + 2]
    if (shadowBoost > 0) {
      const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255
      const boost = Math.pow(1 - luma, 2) * shadowBoost * 60
      r = Math.min(255, r + boost)
      g = Math.min(255, g + boost)
      b = Math.min(255, b + boost)
    }
    if (contrast !== 0) {
      r = Math.min(255, Math.max(0, factor * (r - 128) + 128))
      g = Math.min(255, Math.max(0, factor * (g - 128) + 128))
      b = Math.min(255, Math.max(0, factor * (b - 128) + 128))
    }
    preData[i] = r; preData[i + 1] = g; preData[i + 2] = b
    if ((i / 4) % 6 === 0 && preData[i + 3] > 30) {
      sampledPixels.push([r, g, b])
    }
  }

  // （平滑已移至目标分辨率量化网格上做，见第 5 步，避免在源分辨率做 O(n·k²) 的 RGB 中值导致卡顿）

  // 3. 提取中值切割调色板
  const palette = medianCut(sampledPixels.length ? sampledPixels : [[128, 128, 128]], colorCount)

  // 4. 块平均重采样至 targetW×targetH
  const grid = new Int32Array(targetW * targetH)
  const blockW = srcW / targetW
  const blockH = srcH / targetH
  for (let gy = 0; gy < targetH; gy++) {
    for (let gx = 0; gx < targetW; gx++) {
      const startX = Math.floor(gx * blockW)
      const startY = Math.floor(gy * blockH)
      const endX = Math.min(srcW, Math.floor((gx + 1) * blockW))
      const endY = Math.min(srcH, Math.floor((gy + 1) * blockH))
      let rSum = 0, gSum = 0, bSum = 0, aSum = 0, count = 0
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const idx = (y * srcW + x) * 4
          rSum += preData[idx]
          gSum += preData[idx + 1]
          bSum += preData[idx + 2]
          aSum += preData[idx + 3]
          count++
        }
      }
      if (count === 0 || aSum / count < 30) {
        grid[gy * targetW + gx] = -1
        continue
      }
      let r = rSum / count
      let g = gSum / count
      let b = bSum / count
      if (ditherStrength > 0) {
        const ditherVal = BAYER_4X4[gy % 4][gx % 4] * ditherStrength * 36
        r = Math.min(255, Math.max(0, r + ditherVal))
        g = Math.min(255, Math.max(0, g + ditherVal))
        b = Math.min(255, Math.max(0, b + ditherVal))
      }
      grid[gy * targetW + gx] = findClosestColorLuma(r, g, b, palette)
    }
  }

  // 5. 量化网格中值平滑（目标分辨率，速度快；消除网格上的孤立像素块）
  if (smoothRadius > 0) {
    smoothGrid(grid, targetW, targetH, smoothRadius, palette.length - 1)
  }

  // 6. 消除单点杂色
  if (enableDespeckle) {
    despeckleGrid(grid, targetW, targetH)
  }

  // 7. 回填到真实像素画布
  const out = new ImageData(targetW, targetH)
  for (let gy = 0; gy < targetH; gy++) {
    for (let gx = 0; gx < targetW; gx++) {
      const colorIdx = grid[gy * targetW + gx]
      const idx = (gy * targetW + gx) * 4
      if (colorIdx >= 0) {
        const c = palette[colorIdx]
        out.data[idx] = c[0]
        out.data[idx + 1] = c[1]
        out.data[idx + 2] = c[2]
        out.data[idx + 3] = 255
      } else {
        out.data[idx + 3] = 0
      }
    }
  }
  return out
}

/** 把 ImageData 绘制到 canvas 并返回 dataURL 字符串 */
export function imageDataToDataURL(img: ImageData): string {
  const cv = document.createElement("canvas")
  cv.width = img.width
  cv.height = img.height
  const ctx = cv.getContext("2d")!
  ctx.putImageData(img, 0, 0)
  return cv.toDataURL("image/png")
}

/** 从 File 读取为 HTMLImageElement 的尺寸与画布 ImageData */
export function loadImageToData(fileData: string): Promise<{ img: HTMLImageElement; data: ImageData; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      const cv = document.createElement("canvas")
      cv.width = img.width
      cv.height = img.height
      const ctx = cv.getContext("2d", { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0)
      let data: ImageData
      try {
        data = ctx.getImageData(0, 0, img.width, img.height)
      } catch {
        reject(new Error("图片跨域限制，无法读取像素"))
        return
      }
      resolve({ img, data, w: img.width, h: img.height })
    }
    img.onerror = () => reject(new Error("图片加载失败"))
    img.src = fileData
  })
}