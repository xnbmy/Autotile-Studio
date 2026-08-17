import type { BaseCanvases, MappingType } from "./types"

/** 顺时针旋转 90°（仅切图固化外角块用；16/47 基础块均为方形，尺寸不变） */
function rotateCW90(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas")
  out.width = src.height
  out.height = src.width
  const ctx = out.getContext("2d", { willReadFrequently: true })
  if (ctx) {
    ctx.imageSmoothingEnabled = false
    ctx.translate(out.width, 0)
    ctx.rotate(Math.PI / 2)
    ctx.drawImage(src, 0, 0)
  }
  return out
}

/** 已解码源图及其像素数据（供跨越边界的环形采样复用，同一 dataURL 只解码一次） */
interface SliceSource {
  w: number
  h: number
  data: Uint8ClampedArray
}
const sliceSourceCache = new Map<string, Promise<SliceSource>>()
export function loadSliceSource(dataUrl: string): Promise<SliceSource> {
  let p = sliceSourceCache.get(dataUrl)
  if (!p) {
    p = new Promise<SliceSource>((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const cv = document.createElement("canvas")
        cv.width = img.width
        cv.height = img.height
        const ctx = cv.getContext("2d", { willReadFrequently: true })
        if (ctx) {
          ctx.drawImage(img, 0, 0)
          return resolve({
            w: cv.width,
            h: cv.height,
            data: ctx.getImageData(0, 0, cv.width, cv.height).data,
          })
        }
        resolve({ w: cv.width, h: cv.height, data: new Uint8ClampedArray(0) })
      }
      img.onerror = () => reject(new Error("源图加载失败"))
      img.src = dataUrl
    })
    sliceSourceCache.set(dataUrl, p)
  }
  return p
}

/**
 * 按选框位置从源图裁切出单个基础块（与固化提取尺寸一致：gridSize²）。
 * 采用环形（toroidal）采样：选框可越过图片边界，越界处从对侧回绕取样，保证无缝，
 * 与切片拾取区的绕出裁切一致。再施加与固化相同的朝向补偿（外角 +90°/内角 −90°）。
 */
export function cropSliceSlot(
  src: SliceSource,
  pos: { x: number; y: number },
  gridSize: number,
  mappingType: MappingType,
  slotKey: string,
): HTMLCanvasElement {
  const gs = Math.max(1, Math.round(gridSize))
  const w = src.w
  const h = src.h
  const d = src.data
  const px = Math.round(pos.x)
  const py = Math.round(pos.y)
  const cv = document.createElement("canvas")
  cv.width = gs
  cv.height = gs
  const ctx = cv.getContext("2d", { willReadFrequently: true })
  if (!ctx) return cv
  const out = ctx.createImageData(gs, gs)
  for (let y = 0; y < gs; y++) {
    const sy = (((py + y) % h) + h) % h
    for (let x = 0; x < gs; x++) {
      const sx = (((px + x) % w) + w) % w
      const si = (sy * w + sx) * 4
      const di = (y * gs + x) * 4
      out.data[di] = d[si]
      out.data[di + 1] = d[si + 1]
      out.data[di + 2] = d[si + 2]
      out.data[di + 3] = d[si + 3]
    }
  }
  ctx.putImageData(out, 0, 0)
  const isDual16 = mappingType === "16"
  const outerKey = isDual16 ? "convex" : "outer"
  const cornerKey = isDual16 ? "concave" : "inner"
  if (slotKey === outerKey) return rotateCW90(cv)
  if (slotKey === cornerKey) return rotateCCW90(cv)
  return cv
}

/**
 * 把「方向键操控块」的位移换算成源图选框的位移。
 * 两个角块在固化时被旋转 ±90°（方向相反），选框位移经旋转映射到画布后方向会偏转，
 * 需分别叠加旋转补偿，使内容在画布上按按键方向移动：
 * - 外角块（16=convex / 47=outer，固化顺旋 +90°）：S=(dy,-dx)；
 * - 内角块（16=concave / 47=inner，固化逆旋 -90°）：S=(-dy,dx)；
 * - 其余块直截 S=(dx,dy)。
 */
export function nudgeSourceDelta(
  mappingType: MappingType,
  slotKey: string,
  dx: number,
  dy: number,
): { x: number; y: number } {
  const isDual16 = mappingType === "16"
  const outerKey = isDual16 ? "convex" : "outer"
  const cornerKey = isDual16 ? "concave" : "inner"
  if (slotKey === outerKey) return { x: dy, y: -dx }
  if (slotKey === cornerKey) return { x: -dy, y: dx }
  return { x: dx, y: dy }
}

/** 逆时针旋转 90°（仅切图固化内角块用） */
function rotateCCW90(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas")
  out.width = src.height
  out.height = src.width
  const ctx = out.getContext("2d", { willReadFrequently: true })
  if (ctx) {
    ctx.imageSmoothingEnabled = false
    ctx.translate(0, out.height)
    ctx.rotate(-Math.PI / 2)
    ctx.drawImage(src, 0, 0)
  }
  return out
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("图片加载失败"))
    img.src = src
  })
}

/**
 * 把当前绑定的 5 块槽位素材提取为基础像素块（与生成模板的提取尺寸一致）。
 * 素材目标尺寸：16 整块 tileSize；47 简化半块 tileSize/2（与 generateBaseCanvases 一致）。
 */
export async function buildBaseFromSliceSlots(opts: {
  image: string
  gridSize: number
  slotPositions: Record<string, { x: number; y: number }>
  slotKeys: string[]
  mappingType: MappingType
  tileSize: number
}): Promise<BaseCanvases> {
  const { image, gridSize, slotPositions, slotKeys, mappingType } = opts
  const img = await loadImage(image)
  // 输出尺寸与所选区域完全一致：直接采用 gridSize，不做任何缩放
  const target = Math.max(1, Math.round(gridSize))
  const base: BaseCanvases = {}
  for (const k of slotKeys) {
    const pos = slotPositions[k]
    if (!pos) continue
    const cv = document.createElement("canvas")
    cv.width = target
    cv.height = target
    const ctx = cv.getContext("2d", { willReadFrequently: true })
    if (ctx) {
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, pos.x, pos.y, gridSize, gridSize, 0, 0, target, target)
    }
    base[k] = cv
  }
  // 角槽素材相对标准朝向有偏差：外角块（16=convex / 47=outer）补偿 +90°（顺时针），
  // 内角块（16=concave / 47=inner）补偿 -90°（逆时针）。
  // 仅切图固化时生效，不影响参数生成（deriveTilesFromBase）。
  const isDual16 = mappingType === "16"
  const firstKey = isDual16 ? "convex" : "outer"
  const cornerKey = isDual16 ? "concave" : "inner"
  if (base[firstKey]) base[firstKey] = rotateCW90(base[firstKey])
  if (base[cornerKey]) base[cornerKey] = rotateCCW90(base[cornerKey])
  return base
}
