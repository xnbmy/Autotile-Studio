import {
  BLOB_STANDARD_ORDER,
  BLOB_STANDARD_COLUMNS,
  type NeighborBits,
} from "./tile-mapping"
import type { BaseCanvases, MappingType, ModeBTemplateResult, Overrides, SlotKey } from "./types"
import BLOB47_RECIPES_JSON from "./blob47-recipes.json"

// 可选的输出瓦片尺寸（手动模式）
export const TILE_SIZES = [8, 16, 24, 32, 48, 64]

// ───────────────────────────────────────────────────────────────────────────
// Dual-Grid 16-tile mode（参照参考实现图16）：仅需 5 个基础块，
// convex=左上外角(1000)、concave=左上内角(0111)、edge=上边(1100)、
// fg=全图(1111)、bg=空白(0000)。其余 11 种瓦片由这 5 块经 flip/rot 程序化生成。
// ───────────────────────────────────────────────────────────────────────────
import type { Dual16SlotKey } from "./types"

export const DUAL16_SLOT_KEYS: Dual16SlotKey[] = ["convex", "concave", "edge", "fg", "bg"]
export const DUAL16_LABELS: Record<Dual16SlotKey, string> = {
  convex: "左上外角",
  concave: "左上内角",
  edge: "上边块",
  fg: "全图块",
  bg: "空白块",
}
export const DUAL16_COLORS: Record<Dual16SlotKey, string> = {
  convex: "oklch(0.72 0.18 45 / 0.55)",
  concave: "oklch(0.72 0.16 250 / 0.55)",
  edge: "oklch(0.75 0.14 145 / 0.55)",
  fg: "oklch(0.78 0.13 58 / 0.6)",
  bg: "oklch(0.62 0.02 262 / 0.4)",
}
// 图标高亮位置（每个基础块在 2×2 预览中的中心坐标，仅用于 UI 指示）
// 按 B 位约定 TL=8,TR=4,BL=2,BR=1 的掩码映射到四宫格：
//   convex=0001（右下）、concave=1110（除右下全填）、edge=0011（右列）
export const DUAL16_GRID_POS: Record<Dual16SlotKey, readonly (readonly [number, number])[]> = {
  convex: [[1, 1]],
  concave: [[0, 0], [1, 0], [0, 1]],
  edge: [[0, 1], [1, 1]],
  fg: [[0, 0], [1, 0], [0, 1], [1, 1]],
  bg: [[0, 0], [1, 0], [0, 1], [1, 1]],
}

// ───────────────────────────────────────────────────────────────────────────
// Blob47 切图模式：13 槽在对称性下只有 5 类形状。
// outer=左上外角、inner=左上内角、edge=上边缘、solid=全实中心、empty=空背景。
// 与 16 模式不同，这 5 块是「半块」(gridSize)，因为 47 是按四象限逐个填充的。
// 其余 8 槽由这 5 块经 flip/rot 推导。
// ───────────────────────────────────────────────────────────────────────────
import type { Blob5SlotKey } from "./types"

export const BLOB5_SLOT_KEYS: Blob5SlotKey[] = ["outer", "inner", "edge", "solid", "empty"]
export const BLOB5_LABELS: Record<Blob5SlotKey, string> = {
  outer: "左上外角",
  inner: "左上内角",
  edge: "上边缘",
  solid: "全实中心",
  empty: "空背景",
}
export const BLOB5_COLORS: Record<Blob5SlotKey, string> = {
  outer: "oklch(0.72 0.18 45 / 0.55)",
  inner: "oklch(0.7 0.16 280 / 0.55)",
  edge: "oklch(0.75 0.14 145 / 0.55)",
  solid: "oklch(0.78 0.13 58 / 0.6)",
  empty: "oklch(0.62 0.02 262 / 0.4)",
}
// 3×3 图标高亮位置，与完整模式的同类槽位保持一致的视觉语义
export const BLOB5_GRID_POS: Record<Blob5SlotKey, readonly (readonly [number, number])[]> = {
  outer: [[0, 0]],
  inner: [[1, 1], [0, 1], [1, 0]],
  edge: [[1, 0]],
  solid: [[1, 1]],
  empty: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]],
}

// ───────────────────────────────────────────────────────────────────────────
// Blob47 拼合算法（用户定义的「1/4 步进偏移拼合」，全程 1:1 无缩放）。
//
// 素材基准（手绘界面固化后的朝向，2×2 量化 TL/TR/BL/BR，1=草 0=背景）：
//   outer = 0010（草左下）  solid = 1111（全草）  empty = 0000（全背景）
//   inner = 1011（凹口右上） edge = 0011（草下半）
// 该朝向让 5 块素材按「上 3 下 2」排版时边界互相衔接（外角下边 ↔ 内角上边、
// 内角右边 ↔ 边界左边），手绘时直观（slice-freeze 固化的 ±90° 补偿即为此）。
//
// 每个输出瓦片 = 4 个象限素材整块偏移绘制（输出尺寸 = 素材尺寸 g，步进 q = g/4）：
//   TL 素材贴 (-q,-q)、TR 贴 (g-q,-q)、BL 贴 (-q,g-q)、BR 贴 (g-q,g-q)，
//   四块在 32×32 窗口内恰好无缝覆盖（[0,3q]² / [3q,g]×[0,3q] / …）。
// 例：mask 28（第一格）= outer 逆 90° + edge 0° + edge 逆 90° + solid → 0000/0111/0111/0111。
// ───────────────────────────────────────────────────────────────────────────

// ───────────────────────────────────────────────────────────────────────────
// Blob47 拼合算法 v2（瓦片级对称派生）。
//
// 关键思路（用户要求）：不能为每个 mask 独立用素材拼——那会让 112 等格子的
// 边界变成素材接缝的「整齐直线」。正确做法是先把 47 个 mask 按 8 邻域旋转/
// 镜像（D4 群）归约为 14 个规范形，每个规范形用 1/4 偏移拼合一次，其余瓦片
// 由规范形瓦片整体旋转/镜像派生（112=rot90(28)、241=rot90(124) 等），
// 这样边界噪声随旋转一致，对称性自动成立。
//
// 素材基准（与手绘/固化一致，2×2 量化）：outer=0010 草左下、solid=1111、
// empty=0000、inner=1011 凹口右上、edge=0011 草下半。
// 组合表经块级穷举搜索验证：12 个规范形精确匹配标准 blob 形状，仅规范形
// 1（单上边）与 5（上+右下）各差 1~2 像素（5 素材的粒度上限）。
// ───────────────────────────────────────────────────────────────────────────

/** 单个 Reference Fragment 的定义（坐标基准：16×16 母材 / 48×48 虚拟画布） */
interface Blob47FragmentSpec {
  base: number
  source: { x: number; y: number; w: number; h: number }
  dest: { x: number; y: number }
  rotation: number
  flipX: boolean
  flipY: boolean
}
/** 单个瓦片拼合配方（来自数据.json / 参考.html） */
interface Blob47RecipeSpec {
  id: number
  mask: number
  crop: { x: number; y: number }
  fragments: Blob47FragmentSpec[]
}
/** 参考算法 5 个母材索引 → 项目槽位键。0=外角 1=全草 2=全土 3=内角 4=直边 */
const RECIPE_BASE_SLOT: Blob5SlotKey[] = ["outer", "solid", "empty", "inner", "edge"]

const BLOB47_RECIPES = (BLOB47_RECIPES_JSON as { recipes: Record<string, Blob47RecipeSpec> }).recipes

/** 水平镜像（左右翻转），返回新画布 */
function flipCanvasX(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas")
  out.width = src.width
  out.height = src.height
  const ctx = out.getContext("2d", { willReadFrequently: true })
  if (ctx) {
    ctx.imageSmoothingEnabled = false
    ctx.translate(src.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(src, 0, 0)
  }
  return out
}
/** 垂直镜像（上下翻转），返回新画布 */
function flipCanvasY(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas")
  out.width = src.width
  out.height = src.height
  const ctx = out.getContext("2d", { willReadFrequently: true })
  if (ctx) {
    ctx.imageSmoothingEnabled = false
    ctx.translate(0, src.height)
    ctx.scale(1, -1)
    ctx.drawImage(src, 0, 0)
  }
  return out
}

/**
 * 把项目标准朝向的基础块（outer=0010、inner=1011）换算成参考算法母材朝向
 * （外角=0001 草右下、内角=1110 缺右下）：外角水平镜像、内角垂直镜像。
 */
function toReferenceBase(k: Blob5SlotKey, src: HTMLCanvasElement): HTMLCanvasElement {
  if (k === "outer") return flipCanvasX(src)
  if (k === "inner") return flipCanvasY(src)
  return src
}

/** 复用临时画布，避免为每个 fragment 都新建 allocation */
let recipeTempCanvas: HTMLCanvasElement | null = null
function getRecipeTemp(w: number, h: number): CanvasRenderingContext2D | null {
  if (!recipeTempCanvas) recipeTempCanvas = document.createElement("canvas")
  if (recipeTempCanvas.width !== w || recipeTempCanvas.height !== h) {
    recipeTempCanvas.width = w
    recipeTempCanvas.height = h
  }
  const ctx = recipeTempCanvas.getContext("2d", { willReadFrequently: true })
  if (ctx) ctx.imageSmoothingEnabled = false
  return ctx
}

/** 按配方在 3S×3S 虚拟画布拼块并从 crop 偏移截取 S×S 瓦片（全程 1:1 无缩放） */
function renderRecipeTile(
  recipe: Blob47RecipeSpec,
  refBases: Record<number, HTMLCanvasElement>,
  scale: number,
  outSize: number,
): HTMLCanvasElement | null {
  const vcSize = Math.round(48 * scale)
  const vc = document.createElement("canvas")
  vc.width = vcSize
  vc.height = vcSize
  const ctx = vc.getContext("2d", { willReadFrequently: true })
  if (!ctx) return null
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, vcSize, vcSize)

  for (const frag of recipe.fragments) {
    const base = refBases[frag.base]
    if (!base) continue
    const sx = frag.source.x * scale
    const sy = frag.source.y * scale
    const sw = frag.source.w * scale
    const sh = frag.source.h * scale
    const dx = frag.dest.x * scale
    const dy = frag.dest.y * scale
    const tw = Math.max(1, Math.round(sw))
    const th = Math.max(1, Math.round(sh))
    const tctx = getRecipeTemp(tw, th)
    if (!tctx) continue
    tctx.clearRect(0, 0, tw, th)
    tctx.drawImage(base, sx, sy, sw, sh, 0, 0, tw, th)

    let w = tw
    let h = th
    if (frag.rotation % 180 !== 0) {
      w = th
      h = tw
    }
    ctx.save()
    ctx.translate(dx + w / 2, dy + h / 2)
    if (frag.rotation) ctx.rotate((frag.rotation * Math.PI) / 180)
    ctx.scale(frag.flipX ? -1 : 1, frag.flipY ? -1 : 1)
    ctx.drawImage(recipeTempCanvas as HTMLCanvasElement, -tw / 2, -th / 2, tw, th)
    ctx.restore()
  }

  const out = document.createElement("canvas")
  out.width = outSize
  out.height = outSize
  const octx = out.getContext("2d", { willReadFrequently: true })
  if (!octx) return null
  octx.imageSmoothingEnabled = false
  octx.drawImage(vc, recipe.crop.x * scale, recipe.crop.y * scale, outSize, outSize, 0, 0, outSize, outSize)
  return out
}

/** 从 empty 素材采样泥土背景色；无有效色则回退默认泥土色 #8a6642 */
function sampleDirtColor(srcs: Partial<Record<Blob5SlotKey, HTMLCanvasElement>>): [number, number, number] {
  const e = srcs.empty
  if (e) {
    const ctx = e.getContext("2d", { willReadFrequently: true })
    if (ctx) {
      const probe = (x: number, y: number): [number, number, number] | null => {
        try {
          const d = ctx.getImageData(x, y, 1, 1).data
          return d[3] > 0 ? [d[0], d[1], d[2]] : null
        } catch {
          return null
        }
      }
      const midX = Math.floor(e.width / 2)
      const midY = Math.floor(e.height / 2)
      const p = probe(midX, midY) ?? probe(0, 0) ?? probe(e.width - 1, e.height - 1)
      if (p) return p
    }
  }
  return [138, 102, 66]
}

/** 若 empty 素材含透明像素（参数路径生成的纯背景），复制并填成泥土背景色保证不透明 */
function makeEmptyOpaque(src: HTMLCanvasElement, dirt: [number, number, number]): HTMLCanvasElement {
  const copy = document.createElement("canvas")
  copy.width = src.width
  copy.height = src.height
  const ctx = copy.getContext("2d", { willReadFrequently: true })
  if (ctx) {
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(src, 0, 0)
    const img = ctx.getImageData(0, 0, copy.width, copy.height)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) {
        d[i] = dirt[0]
        d[i + 1] = dirt[1]
        d[i + 2] = dirt[2]
        d[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }
  return copy
}

/**
 * 从 5 素材生成 47 全部瓦片（新算法：Fragment + 错位取景，数据来自 数据.json）。
 * 素材先换算成参考算法母材朝向（外角 flipX、内角 flipY），再在 3S×3S 虚拟画布上
 * 按配方的 source/dest/rotation/flip 逐块拼合，最后从 crop 偏移截取 S×S，全程 1:1。
 */
export function buildBlob47Tiles(
  srcs: Partial<Record<Blob5SlotKey, HTMLCanvasElement>>,
  order: number[],
): Map<number, HTMLCanvasElement> {
  const tiles = new Map<number, HTMLCanvasElement>()
  const anyCanvas = srcs.outer ?? srcs.solid ?? srcs.empty ?? srcs.inner ?? srcs.edge
  if (!anyCanvas) return tiles
  const outSize = anyCanvas.width
  if (!(outSize > 0)) return tiles
  const scale = outSize / 16

  const dirt = sampleDirtColor(srcs)
  // 参考算法 5 母材：0=外角 1=全草 2=全土 3=内角 4=直边
  const refBases: Record<number, HTMLCanvasElement> = {}
  for (let i = 0; i < RECIPE_BASE_SLOT.length; i++) {
    const k = RECIPE_BASE_SLOT[i]
    const raw = srcs[k]
    if (!raw) continue
    let b = toReferenceBase(k, raw)
    if (k === "empty") b = makeEmptyOpaque(b, dirt)
    refBases[i] = b
  }

  for (const mask of order) {
    const recipe = BLOB47_RECIPES[String(mask)]
    if (!recipe || !recipe.fragments) continue
    const tile = renderRecipeTile(recipe, refBases, scale, outSize)
    if (tile) tiles.set(mask, tile)
  }
  return tiles
}

/** 返回当前映射表对应的槽位键列表，避免 16/47 混用同一套槽集 */
export function slotKeysForType(t: MappingType): string[] {
  if (t === "16") return DUAL16_SLOT_KEYS as string[]
  return BLOB5_SLOT_KEYS as string[]
}
/** 返回当前映射表对应的空槽位对象，供 store 初始化/重置 */
export function emptySlotsForType(t: MappingType): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const k of slotKeysForType(t)) out[k] = null
  return out
}

// ── Dual-Grid 16-tile 拼合（参照参考实现图16）──────────────────────────────
// 5 个基础块（整块 tileSize）经 flip/rot 变换生成全部 16 种瓦片。
// 坐标约定与参考代码一致：flipH=scale(-1,1)、flipV=scale(1,-1)、rotDeg 顺时针。

/** 把整块源 tile 经 flip/rot 变换后绘制到目标 (destX,destY)，尺寸均为 tileSize */
function drawTileTransformed(
  ctx: CanvasRenderingContext2D,
  tile: HTMLCanvasElement,
  flipH: boolean,
  flipV: boolean,
  rotDeg: number,
  destX: number,
  destY: number,
  tileSize: number,
) {
  ctx.save()
  ctx.translate(destX + tileSize / 2, destY + tileSize / 2)
  if (rotDeg !== 0) ctx.rotate((rotDeg * Math.PI) / 180)
  if (flipH) ctx.scale(-1, 1)
  if (flipV) ctx.scale(1, -1)
  ctx.drawImage(tile, -tileSize / 2, -tileSize / 2, tileSize, tileSize)
  ctx.restore()
}

/** 把整块源 tile 变换后，仅取其 1/4 子角落 (cornerIdx: 0=TL,1=TR,2=BL,3=BR) 绘制到目标 */
function drawQuarterTransformed(
  ctx: CanvasRenderingContext2D,
  tile: HTMLCanvasElement,
  flipH: boolean,
  flipV: boolean,
  rotDeg: number,
  cornerIdx: number,
  destX: number,
  destY: number,
  tileSize: number,
) {
  const half = tileSize / 2
  const temp = document.createElement("canvas")
  temp.width = tileSize
  temp.height = tileSize
  const tctx = temp.getContext("2d", { willReadFrequently: true })
  if (!tctx) return
  tctx.imageSmoothingEnabled = false
  tctx.save()
  tctx.translate(tileSize / 2, tileSize / 2)
  if (rotDeg !== 0) tctx.rotate((rotDeg * Math.PI) / 180)
  if (flipH) tctx.scale(-1, 1)
  if (flipV) tctx.scale(1, -1)
  tctx.drawImage(tile, -tileSize / 2, -tileSize / 2, tileSize, tileSize)
  tctx.restore()

  const qx = cornerIdx % 2 === 1 ? half : 0
  const qy = cornerIdx >= 2 ? half : 0
  ctx.drawImage(temp, qx, qy, half, half, destX, destY, half, half)
}

/** 把整块画布绕中心顺时针旋转 deg 度（正角=顺时针，负角=逆时针），返回新画布 */
function rotateCanvasDeg(src: HTMLCanvasElement, deg: number): HTMLCanvasElement {
  const out = document.createElement("canvas")
  const w = src.width
  const h = src.height
  if (Math.abs(deg % 180) === 90) {
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
 * 参照参考实现 drawSpecTile16：用 5 个基础块拼出指定 4-bit mask 的瓦片。
 * 变换矩阵与参考代码逐字对齐，确保几何一致。
 */
export function drawSpecTile16(
  ctx: CanvasRenderingContext2D,
  tiles: Record<Dual16SlotKey, HTMLCanvasElement | null>,
  mask: number,
  destX: number,
  destY: number,
  tileSize: number,
) {
  const half = tileSize / 2
  const c = (k: Dual16SlotKey) => tiles[k]
  const T = (k: Dual16SlotKey, flipH: boolean, flipV: boolean, rot: number, x: number, y: number) => {
    const t = c(k)
    if (t) drawTileTransformed(ctx, t, flipH, flipV, rot, x, y, tileSize)
  }
  const Q = (
    k: Dual16SlotKey,
    flipH: boolean,
    flipV: boolean,
    rot: number,
    corner: number,
    x: number,
    y: number,
  ) => {
    const t = c(k)
    if (t) drawQuarterTransformed(ctx, t, flipH, flipV, rot, corner, x, y, tileSize)
  }

  // 对角十字瓦片（1001 / 0110）需象限细分拼合
  // 基础块方向（generateBaseCanvases 生成后）：
  //   convex = 草在 BL（左下），concave = 凹口在 BL（左下），edge = 草在下方
  if (mask === 0b1001) {
    // TL+BR 草：TL 象限放草在 TL 的凸块（convex 顺时针90°），BR 象限放草在 BR（convex 逆时针90°）
    Q("convex", false, false, 90, 0, destX, destY)
    // 背景象限素材旋转 180°（用户确认：对角十字的背景块方向需翻转）
    Q("bg", false, false, 180, 1, destX + half, destY)
    Q("bg", false, false, 180, 2, destX, destY + half)
    Q("convex", false, false, 270, 3, destX + half, destY + half)
    return
  }
  if (mask === 0b0110) {
    // TR+BL 草：TR 象限放草在 TR（convex 顺时针180°），BL 象限放草在 BL（convex 原样）
    Q("bg", false, false, 180, 0, destX, destY)
    Q("convex", false, false, 180, 1, destX + half, destY)
    Q("convex", false, false, 0, 2, destX, destY + half)
    Q("bg", false, false, 180, 3, destX + half, destY + half)
    return
  }

  // 其余 14 种：整块旋转生成（基础块方向：convex=草在BL，concave=凹口在BL，edge=草在下方）
  switch (mask) {
    case 0b0000: T("bg", false, false, 0, destX, destY); break
    case 0b1111: T("fg", false, false, 0, destX, destY); break

    // convex（草在 BL）→ 旋转到目标角
    case 0b0001: T("convex", false, false, 90, destX, destY); break   // TL 草
    case 0b0010: T("convex", false, false, 180, destX, destY); break  // TR 草
    case 0b0100: T("convex", false, false, 0, destX, destY); break    // BL 草
    case 0b1000: T("convex", false, false, 270, destX, destY); break  // BR 草

    // concave（凹口在 BL）→ 旋转到目标凹口
    case 0b1110: T("concave", false, false, 270, destX, destY); break // 凹口 BR
    case 0b1101: T("concave", false, false, 0, destX, destY); break   // 凹口 BL
    case 0b1011: T("concave", false, false, 180, destX, destY); break // 凹口 TR
    case 0b0111: T("concave", false, false, 90, destX, destY); break  // 凹口 TL

    // edge（草在下方）→ 旋转到目标边
    case 0b0011: T("edge", false, false, 180, destX, destY); break  // 草上方
    case 0b1100: T("edge", false, false, 0, destX, destY); break    // 草下方
    case 0b0101: T("edge", false, false, 90, destX, destY); break   // 草左方
    case 0b1010: T("edge", false, false, 270, destX, destY); break  // 草右方
  }
}

/**
 * Crops a single `gridSize × gridSize` cell out of the imported image and scales
 * it into a `outSize × outSize` canvas. The single source→output scale is the only
 * resize that happens; quadrants are then copied 1:1 so neighbouring tiles stay gap-free.
 */
function cropSlot(
  img: HTMLImageElement,
  gx: number,
  gy: number,
  gridSize: number,
  outSize: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = outSize
  canvas.height = outSize
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (ctx) {
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, gx * gridSize, gy * gridSize, gridSize, gridSize, 0, 0, outSize, outSize)
  }
  return canvas
}

// ---------------------------------------------------------------------------
// Dual-grid (双网格) 16-tile system
// The 4x4 export layout requested by the user, in reading order.
// Row 1: 0000, 0001, 0110, 1000
// Row 2: 0010, 0101, 1011, 0011
// Row 3: 1001, 0111, 1111, 1110
// Row 4: 0100, 1100, 1101, 1010
export const DUAL_GRID_16_ORDER: number[] = [
  0b0000, 0b0001, 0b0110, 0b1000,
  0b0010, 0b0101, 0b1011, 0b0011,
  0b1001, 0b0111, 0b1111, 0b1110,
  0b0100, 0b1100, 0b1101, 0b1010,
]
export const DUAL_GRID_16_COLUMNS = 4

// In the dual-grid system each sub-tile is slightly smaller than half the
// output tile so that adjacent tiles overlap slightly and avoid seams.
// For a standard 32-pixel tile this gives a 28-pixel sub-tile size.
// (保留备用，当前拼合已对齐参考实现，不再使用此函数)

// The two diagonal-cross masks that CANNOT be represented by the 13-slot
// quadrant system — they must be synthesised from 4 outer-corner slots.
// (已废弃：16 模式统一走 drawSpecTile16 象限裁剪路径)

function bitsFor47(mask: number): NeighborBits {
  return {
    n: !!(mask & 1),
    ne: !!(mask & 2),
    e: !!(mask & 4),
    se: !!(mask & 8),
    s: !!(mask & 16),
    sw: !!(mask & 32),
    w: !!(mask & 64),
    nw: !!(mask & 128),
  }
}

/**
 * Quadrant Stitching generator.
 *
 * 16 模式：5 基础块 flip/rot 拼出 16 瓦片（尺寸 tileSize）。
 * 47 模式：源图按 gridSize 1:1 裁出 5 素材 → 应用固化同款角度补偿
 * （outer +90°、inner -90°）→ buildBlob47Tiles 偏移拼合（输出 = gridSize）。
 */
export function generateQuadrantStitch(
  imageDataUrl: string,
  gridSize: number,
  slots: Record<string, string | null>,
  mappingType: MappingType,
  tileSize: number,
): Promise<ModeBTemplateResult> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      try {
        const outTileSize = Math.max(1, tileSize)
        const isDual16 = mappingType === "16"

        // 16 模式：5 个基础块，切片尺寸 = 整块 tileSize（参照参考图16，源图每格是完整瓦片）
        // 47 模式：5 个半块，切片尺寸 = gridSize（源网格原样，不缩放）
        const slotKeys = isDual16
          ? (DUAL16_SLOT_KEYS as string[])
          : (BLOB5_SLOT_KEYS as string[])
        const slotLabels = isDual16 ? DUAL16_LABELS : BLOB5_LABELS
        // 每个瓦片在 sheet 上的步长：16 模式 = outTileSize；47 模式 = gridSize
        const genTile = isDual16 ? outTileSize : Math.max(1, gridSize)
        const sliceSize = isDual16 ? outTileSize : gridSize

        const slotCanvases: Record<string, HTMLCanvasElement | null> = {}
        const missing: string[] = []
        for (const key of slotKeys) {
          const cellKey = slots[key]
          if (!cellKey) {
            missing.push(key)
            continue
          }
          const [gx, gy] = cellKey.split(",").map(Number)
          slotCanvases[key] = cropSlot(img, gx, gy, gridSize, sliceSize)
        }
        if (missing.length > 0) {
          reject(new Error(`尚有 ${missing.length} 个槽位未绑定：\n${missing.map((m) => slotLabels[m as keyof typeof slotLabels]).join("、")}`))
          return
        }

        const order: (number | null)[] = isDual16 ? DUAL_GRID_16_ORDER : BLOB_STANDARD_ORDER
        const columns = isDual16 ? DUAL_GRID_16_COLUMNS : BLOB_STANDARD_COLUMNS
        const valid = order.filter((m) => m !== null) as number[]
        const rows = Math.ceil(valid.length / columns)

        const sheet = document.createElement("canvas")
        sheet.width = columns * genTile
        sheet.height = rows * genTile
        const sctx = sheet.getContext("2d", { willReadFrequently: true })
        if (!sctx) {
          reject(new Error("无法创建画布上下文"))
          return
        }
        sctx.imageSmoothingEnabled = false

        const tiles = new Map<number, HTMLCanvasElement>()

        if (isDual16) {
          // Dual-Grid 16：直接以 outTileSize 为瓦片尺寸，用 5 基础块翻转/旋转拼合，
          // 不再做二次缩放（即导出尺寸 = 源切片尺寸，无模糊、无几何错位）。
          // 参考图对照修正：左上外角（convex）逆时针 90°、上边界（edge）旋转 180°、
          // 内角（concave）顺时针 90°，再交给 drawSpecTile16 拼合。
          const rot = (k: Dual16SlotKey, deg: number) => {
            const src = slotCanvases[k]
            return src ? rotateCanvasDeg(src, deg) : null
          }
          const dualSlots: Record<Dual16SlotKey, HTMLCanvasElement | null> = {
            convex: rot("convex", -90),
            concave: rot("concave", 90),
            edge: rot("edge", 180),
            fg: slotCanvases.fg ?? null,
            bg: slotCanvases.bg ?? null,
          }
          // 对角十字瓦片（1001/0110）：整块叠画会互相覆盖，改用象限裁剪。
          // 凸块素材（参考图左上外角）草在右下角，经 -90° 修正后草在右上角，
          // 裁剪时按实际方位旋转，让草落在目标象限。
          const half = outTileSize / 2
          const quad = (ctx: CanvasRenderingContext2D, k: Dual16SlotKey, flipH: boolean, flipV: boolean, rot: number, corner: number, x: number, y: number) => {
            const t = dualSlots[k]
            if (t) drawQuarterTransformed(ctx, t, flipH, flipV, rot, corner, x, y, outTileSize)
          }
          const renderMask = (ctx: CanvasRenderingContext2D, aMask: number, x: number, y: number) => {
            // 注意：order 中的 mask 是 B 位约定（TL=8,TR=4,BL=2,BR=1），
            // drawSpecTile16 内部用 A 位约定（TL=1,TR=2,BL=4,BR=8），必须先转换。
            // 对角十字（1001/0110）在两种约定下数值相同，但语义要保持一致。
            if (aMask === 0b1001) {
              // TL+BR 草：TR/BL 用空白块填充（不留透明），背景素材旋转 180°
              quad(ctx, "convex", false, false, 270, 0, x, y)
              quad(ctx, "bg", false, false, 180, 1, x + half, y)
              quad(ctx, "bg", false, false, 180, 2, x, y + half)
              quad(ctx, "convex", false, false, 90, 3, x + half, y + half)
              return
            }
            if (aMask === 0b0110) {
              // TR+BL 草：TL/BR 用空白块填充（不留透明），背景素材旋转 180°。
              // 注意 dualSlots.convex 已经 -90° 补偿（草在右上 TR 角），
              // 与 drawSpecTile16 的素材（草左下 BL）基准不同，旋转方案也不同。
              quad(ctx, "bg", false, false, 180, 0, x, y)
              quad(ctx, "convex", false, false, 0, 1, x + half, y)
              quad(ctx, "convex", false, false, 180, 2, x, y + half)
              quad(ctx, "bg", false, false, 180, 3, x + half, y + half)
              return
            }
            drawSpecTile16(ctx, dualSlots, aMask, x, y, outTileSize)
          }
          order.forEach((mask, idx) => {
            if (mask === null) return
            const tx = (idx % columns) * genTile
            const ty = Math.floor(idx / columns) * genTile
            const aMask = bMaskToAMask(mask)
            // 单独渲染该 mask 的瓦片（供测试地图/tilesheet 使用）
            const tc = document.createElement("canvas")
            tc.width = outTileSize
            tc.height = outTileSize
            const tctx = tc.getContext("2d", { willReadFrequently: true })
            if (tctx) {
              tctx.imageSmoothingEnabled = false
              renderMask(tctx, aMask, 0, 0)
            }
            sctx.drawImage(tc, tx, ty)
            tiles.set(mask, tc)
          })
        } else {
          // 47-blob：素材按 gridSize 1:1 裁取 → 固化同款角度补偿（外角 +90°/内角 -90°）
          // → buildBlob47Tiles 1/4 步进偏移整块拼合（输出瓦片 = gridSize，全程无缩放）。
          const srcs: Partial<Record<Blob5SlotKey, HTMLCanvasElement>> = {}
          const rot = (k: Blob5SlotKey, deg: number) => {
            const src = slotCanvases[k]
            if (!src) return
            srcs[k] = deg === 0 ? src : rotateCanvasDeg(src, deg)
          }
          rot("outer", 90)
          rot("inner", -90)
          rot("edge", 0)
          rot("solid", 0)
          rot("empty", 0)
          const blobTiles = buildBlob47Tiles(srcs, valid as number[])
          for (const mask of valid as number[]) {
            const tile = blobTiles.get(mask)
            if (!tile) continue
            tiles.set(mask, tile)
            const idx = order.indexOf(mask)
            const tx = (idx % columns) * genTile
            const ty = Math.floor(idx / columns) * genTile
            sctx.drawImage(tile, tx, ty)
          }
        }

        resolve({
          canvas: sheet,
          width: sheet.width,
          height: sheet.height,
          tileSize: genTile,
          mappingType,
          slots,
          tiles,
          columns,
          rows,
        })
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = () => reject(new Error("图片加载失败"))
    img.src = imageDataUrl
  })
}

// 双网格 mask 的位约定转换：B 模式（参考图/模板，TL=8,TR=4,BL=2,BR=1）→
// A 模式（drawSpecTile16/renderDualTileArc，TL=1,TR=2,BL=4,BR=8）。
export function bMaskToAMask(b: number): number {
  let a = 0
  if (b & 8) a |= 1 // TL
  if (b & 4) a |= 2 // TR
  if (b & 2) a |= 4 // BL
  if (b & 1) a |= 8 // BR
  return a
}

/** 16 模式的全实 mask（四邻居皆草） */
export const MASK16_FULL = 0b1111
/** 47 模式的全实 mask（八邻居皆草） */
export const MASK47_FULL = 0b11111111

/**
 * P2 手绘引擎核心：从基础像素画布实时派生当前映射表下全部瓦片。
 *  - 16 模式：5 个整块基础块 → drawSpecTile16 拼出 16 种 mask
 *    （DUAL_GRID_16_ORDER 为 B 位约定，渲染前转成 drawSpecTile16 的 A 位约定，
 *      保证瓦片角位与参考图/预览一致：0001=右下角）
 *  - 47 模式：5 个素材 → buildBlob47Tiles 按 1/4 步进偏移拼出 BLOB_STANDARD_ORDER 中的全部 mask
 * 输入画布直接复用（不拷贝），每次编辑后调 `setBaseCanvases({...})` 触发重算。
 */
export function deriveTilesFromBase(
  baseCanvases: BaseCanvases,
  mappingType: MappingType,
  tileSize: number,
): Map<number, HTMLCanvasElement> {
  const tiles = new Map<number, HTMLCanvasElement>()

  if (mappingType === "16") {
    const size = Math.max(1, Math.round(tileSize))
    const slots: Record<Dual16SlotKey, HTMLCanvasElement | null> = {
      convex: baseCanvases.convex ?? null,
      concave: baseCanvases.concave ?? null,
      edge: baseCanvases.edge ?? null,
      fg: baseCanvases.fg ?? null,
      bg: baseCanvases.bg ?? null,
    }
    for (const mask of DUAL_GRID_16_ORDER) {
      const tc = document.createElement("canvas")
      tc.width = size
      tc.height = size
      const tctx = tc.getContext("2d", { willReadFrequently: true })
      if (!tctx) continue
      tctx.imageSmoothingEnabled = false
      drawSpecTile16(tctx, slots, bMaskToAMask(mask), 0, 0, size)
      tiles.set(mask, tc)
    }
    return tiles
  }

  // 47 模式：素材尺寸 = 输出瓦片尺寸（参数路径 tileSize / 固化路径 gridSize），
  // 1/4 步进偏移整块拼合，1:1 无缩放（tileSize 参数仅供 16 分支使用）。
  const srcs: Partial<Record<Blob5SlotKey, HTMLCanvasElement>> = {}
  for (const k of BLOB5_SLOT_KEYS) {
    const c = baseCanvases[k]
    if (c) srcs[k] = c
  }
  const order = BLOB_STANDARD_ORDER.filter((m) => m !== null) as number[]
  return buildBlob47Tiles(srcs, order)
}

/**
 * 把单格微调覆盖（overrides）应用到派生瓦片集上。
 * 覆盖键为 mask 的字符串形式；只替换派生集中存在的 mask。
 */
export function applyOverrides(
  tiles: Map<number, HTMLCanvasElement>,
  overrides: Overrides,
): Map<number, HTMLCanvasElement> {
  const keys = Object.keys(overrides)
  if (keys.length === 0) return tiles
  const out = new Map(tiles)
  for (const k of keys) {
    const mask = Number(k)
    const canvas = overrides[k]
    if (Number.isFinite(mask) && out.has(mask) && canvas) out.set(mask, canvas)
  }
  return out
}
