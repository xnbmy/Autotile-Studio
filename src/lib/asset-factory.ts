import { nanoid } from "nanoid"
import { BLOB47, encodeBlob47 } from "./tile-mapping"
import { renderTile, renderBlob5Asset } from "./texture-generator"
import { renderDualTile, renderDualTileArc, DUAL_MASK_LIST } from "./dual-grid"
import { bMaskToAMask } from "./quadrant-stitch"
import type { BaseCanvases, DualAsset, GenParams, MappingType, TileAsset } from "./types"

export function generateTileAsset(name: string, mappingType: MappingType, tileSize: number, params: GenParams): TileAsset {
  const tiles = new Map<number, HTMLCanvasElement>()

  if (mappingType === "16") {
    // 16-tile 映射表使用双网格圆弧算法绘制（4-bit 角掩码）。
    // 键采用 B 位约定（与 DUAL_GRID_16_ORDER/参考图一致，0001=右下角），
    // 渲染前转成 renderDualTileArc 的 A 位约定，保证导出与预览排列一致。
    for (const mask of DUAL_MASK_LIST) {
      const canvas = document.createElement("canvas")
      renderDualTileArc(canvas, tileSize, bMaskToAMask(mask), params.color, "#8a6642", params.erosionStrength, params.edgeHighlight, params.edgeThickness, params.seed)
      tiles.set(mask, canvas)
    }
  } else {
    // 47-tile 映射表使用 blob 自动图块绘制（8-bit 邻居掩码）
    for (const entry of BLOB47) {
      const canvas = document.createElement("canvas")
      renderTile(canvas, tileSize, entry.bits, params, entry.mask, true)
      tiles.set(entry.mask, canvas)
    }
  }

  const fullMask = mappingType === "16" ? 15 : encodeBlob47({ n: true, ne: true, e: true, se: true, s: true, sw: true, w: true, nw: true })
  const thumbCanvas = tiles.get(fullMask) ?? tiles.values().next().value!
  const thumbnail = thumbCanvas.toDataURL("image/png")

  return {
    id: nanoid(8),
    name,
    kind: "autotile",
    mappingType,
    tileSize,
    params: { ...params },
    tiles,
    thumbnail,
    createdAt: Date.now(),
  }
}

export function generateDualAsset(name: string, tileSize: number, grassColor: string, dirtColor: string, gradient: boolean): DualAsset {
  const tiles = new Map<number, HTMLCanvasElement>()
  for (const maskIndex of DUAL_MASK_LIST) {
    const canvas = document.createElement("canvas")
    if (gradient) {
      // 渐变带选项开启时保留柔和渐变渲染
      renderDualTile(canvas, tileSize, maskIndex, grassColor, dirtColor, true)
    } else {
      // 默认使用圆弧平滑渲染，边缘圆润连贯
      renderDualTileArc(canvas, tileSize, maskIndex, grassColor, dirtColor)
    }
    tiles.set(maskIndex, canvas)
  }
  const thumbnail = (tiles.get(15) ?? tiles.values().next().value!).toDataURL("image/png")
  return {
    id: nanoid(8),
    name,
    kind: "dualgrid",
    tileSize,
    grassColor,
    dirtColor,
    gradient,
    tiles,
    thumbnail,
    createdAt: Date.now(),
  }
}

/** 将画布绕中心旋转 deg 度（90/180/270），返回新画布 */
function rotateCanvas(src: HTMLCanvasElement, deg: number): HTMLCanvasElement {
  const out = document.createElement("canvas")
  const w = src.width
  const h = src.height
  if (deg % 180 === 90) {
    out.width = h
    out.height = w
  } else {
    out.width = w
    out.height = h
  }
  const ctx = out.getContext("2d", { willReadFrequently: true })
  if (ctx) {
    ctx.imageSmoothingEnabled = false
    ctx.translate(out.width / 2, out.height / 2)
    ctx.rotate((deg * Math.PI) / 180)
    ctx.drawImage(src, -w / 2, -h / 2)
  }
  return out
}

/**
 * 把当前参数生成的图块集「固化为像素」，产出 5 块基础像素画布（BaseCanvases）。
 * D1：手绘统一走 5 块简化模式。
 *  - 16 映射 → Dual16SlotKey（convex/concave/edge/fg/bg），整块 tileSize。
 *  - 47 映射 → Blob5SlotKey（outer/inner/edge/solid/empty），半块 qSize。
 * P1 阶段仅写入 store 供手绘模式接管；P2 画布引擎据此渲染并支持逐像素编辑。
 */
export function generateBaseCanvases(mappingType: MappingType, tileSize: number, params: GenParams): BaseCanvases {
  const out: BaseCanvases = {}

  if (mappingType === "16") {
    // 4-bit 角掩码（TL=1,TR=2,BL=4,BR=8）→ 5 基础块。
    // 必须与 drawSpecTile16 的消费方式严格一致：
    //   convex=左上外角(0001)、concave=左上内角(1110，不旋转)、edge=上边(0011)、
    //   fg=全实(1111)、bg=全空(0000)。
    const defs: { key: string; mask: number; rot: number }[] = [
      { key: "convex", mask: 0b1000, rot: 90 }, // 左上外角（凸角指向左上，草在右下），顺时针旋转 90°
      { key: "concave", mask: 0b0111, rot: 270 }, // 左上内角（凹口在左上，草在右下为主），逆时针旋转 90°
      { key: "edge", mask: 0b1100, rot: 0 }, // 上边界（草在下方）
      { key: "fg", mask: 0b1111, rot: 0 }, // 全实心图块
      { key: "bg", mask: 0b0000, rot: 0 }, // 全空
    ]
    for (const { key, mask, rot } of defs) {
      const canvas = document.createElement("canvas")
      renderDualTileArc(canvas, tileSize, mask, params.color, "#8a6642", params.erosionStrength, params.edgeHighlight, params.edgeThickness, params.seed)
      out[key] = rot === 0 ? canvas : rotateCanvas(canvas, rot)
    }
  } else {
    // 47 映射：5 个素材（整块 tileSize，与拼合输出瓦片同尺寸）。
    // 朝向基准与固化/手绘一致（2×2 量化）：outer=0010 草左下、solid=1111、
    // empty=0000、inner=1011 凹口右上、edge=0011 草下半。
    for (const k of ["outer", "inner", "edge", "solid", "empty"] as const) {
      const canvas = document.createElement("canvas")
      renderBlob5Asset(canvas, tileSize, k, params)
      out[k] = canvas
    }
  }

  return out
}
