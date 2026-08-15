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
  slots: Record<string, string | null>
  slotKeys: string[]
  mappingType: MappingType
  tileSize: number
}): Promise<BaseCanvases> {
  const { image, gridSize, slots, slotKeys, mappingType, tileSize } = opts
  const img = await loadImage(image)
  const isDual16 = mappingType === "16"
  const target = isDual16 ? tileSize : Math.max(1, Math.round(tileSize / 2))
  const base: BaseCanvases = {}
  for (const k of slotKeys) {
    const key = slots[k]
    if (!key) continue
    const [col, row] = key.split(",").map(Number)
    const cv = document.createElement("canvas")
    cv.width = target
    cv.height = target
    const ctx = cv.getContext("2d", { willReadFrequently: true })
    if (ctx) {
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, col * gridSize, row * gridSize, gridSize, gridSize, 0, 0, target, target)
    }
    base[k] = cv
  }
  // 角槽素材相对标准朝向有偏差：外角块（16=convex / 47=outer）补偿 +90°（顺时针），
  // 内角块（16=concave / 47=inner）补偿 -90°（逆时针）。
  // 仅切图固化时生效，不影响参数生成（deriveTilesFromBase）。
  const firstKey = isDual16 ? "convex" : "outer"
  const cornerKey = isDual16 ? "concave" : "inner"
  if (base[firstKey]) base[firstKey] = rotateCW90(base[firstKey])
  if (base[cornerKey]) base[cornerKey] = rotateCCW90(base[cornerKey])
  return base
}
