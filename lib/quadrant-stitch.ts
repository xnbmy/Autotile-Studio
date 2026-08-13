import {
  BLOB_STANDARD_ORDER,
  BLOB_STANDARD_COLUMNS,
  type NeighborBits,
} from "./tile-mapping"
import type { BaseCanvases, MappingType, ModeBTemplateResult, SlotKey } from "./types"

// 可选的输出瓦片尺寸（手动模式）
export const TILE_SIZES = [8, 16, 24, 32, 48, 64]

export const SLOT_LABELS: Record<SlotKey, string> = {
  TL_OUTER: "左上外角",
  TR_OUTER: "右上外角",
  BL_OUTER: "左下外角",
  BR_OUTER: "右下外角",
  TL_INNER: "左上内角",
  TR_INNER: "右上内角",
  BL_INNER: "左下内角",
  BR_INNER: "右下内角",
  TOP_EDGE: "上边缘",
  LEFT_EDGE: "左边缘",
  RIGHT_EDGE: "右边缘",
  BOTTOM_EDGE: "下边缘",
  CENTER_SOLID: "全实中心",
  EMPTY_DIRT: "空背景",
}

export const SLOT_ORDER: SlotKey[] = [
  "TL_OUTER",
  "TR_OUTER",
  "BL_OUTER",
  "BR_OUTER",
  "TL_INNER",
  "TR_INNER",
  "BL_INNER",
  "BR_INNER",
  "TOP_EDGE",
  "LEFT_EDGE",
  "RIGHT_EDGE",
  "BOTTOM_EDGE",
  "CENTER_SOLID",
  "EMPTY_DIRT",
]

export const SLOT_COLORS: Record<SlotKey, string> = {
  TL_OUTER: "oklch(0.72 0.18 45 / 0.55)",
  TR_OUTER: "oklch(0.72 0.18 75 / 0.55)",
  BL_OUTER: "oklch(0.72 0.18 105 / 0.55)",
  BR_OUTER: "oklch(0.72 0.18 135 / 0.55)",
  TL_INNER: "oklch(0.7 0.16 280 / 0.55)",
  TR_INNER: "oklch(0.7 0.16 250 / 0.55)",
  BL_INNER: "oklch(0.7 0.16 220 / 0.55)",
  BR_INNER: "oklch(0.7 0.16 190 / 0.55)",
  TOP_EDGE: "oklch(0.75 0.14 145 / 0.55)",
  LEFT_EDGE: "oklch(0.75 0.14 175 / 0.55)",
  RIGHT_EDGE: "oklch(0.75 0.14 115 / 0.55)",
  BOTTOM_EDGE: "oklch(0.75 0.14 85 / 0.55)",
  CENTER_SOLID: "oklch(0.78 0.13 58 / 0.6)",
  EMPTY_DIRT: "oklch(0.62 0.02 262 / 0.4)",
}

// 每个槽位在 3×3 九宫格图标中高亮的格子坐标 [col, row]（0-based, 左上=0,0）
// 用于 SlotIcon 组件绘制 mini 预览
export const SLOT_GRID_POS: Record<SlotKey, readonly (readonly [number, number])[]> = {
  TL_OUTER: [[0, 0]],
  TR_OUTER: [[2, 0]],
  BL_OUTER: [[0, 2]],
  BR_OUTER: [[2, 2]],
  // 内角占据中心区域偏移（用中心格+相邻表示）
  TL_INNER: [[1, 1], [0, 1], [1, 0]],
  TR_INNER: [[1, 1], [2, 1], [1, 0]],
  BL_INNER: [[1, 1], [0, 1], [1, 2]],
  BR_INNER: [[1, 1], [2, 1], [1, 2]],
  TOP_EDGE: [[1, 0]],
  LEFT_EDGE: [[0, 1]],
  RIGHT_EDGE: [[2, 1]],
  BOTTOM_EDGE: [[1, 2]],
  CENTER_SOLID: [[1, 1]],
  // 空背景：全部 9 格都填充（淡色）
  EMPTY_DIRT: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]],
}

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
export const DUAL16_GRID_POS: Record<Dual16SlotKey, readonly (readonly [number, number])[]> = {
  convex: [[0, 0]],
  concave: [[1, 1]],
  edge: [[0, 0], [1, 0]],
  fg: [[0, 0], [1, 0], [0, 1], [1, 1]],
  bg: [[0, 0], [1, 0], [0, 1], [1, 1]],
}

// ───────────────────────────────────────────────────────────────────────────
// Blob47「简化模式」：13 槽在对称性下只有 5 类形状。
// outer=左上外角、inner=左上内角、edge=上边缘、solid=全实中心、empty=空背景。
// 与 16 模式不同，这 5 块是「半块」(gridSize)，因为 47 是按四象限逐个填充的。
// 其余 8 槽由这 5 块经 flip/rot 推导；素材非对称时应关闭简化模式。
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

/**
 * 把完整模式的 13 槽键映射为「简化模式基础块 + 变换」。
 * 基础块美术（见 asset-factory.generateBaseCanvases，含旋转）：
 *  - outer = 草在左下角（原右下角顺时针 90°）
 *  - inner = 凹口在右上角（原右下角逆时针 90°）
 *  - edge  = 下边界（草在下方）
 * 各槽位按象限位置翻转/旋转，使形状朝向正确方向。
 */
export const BLOB5_XF: Record<
  SlotKey,
  { base: Blob5SlotKey; flipH: boolean; flipV: boolean; rot: number }
> = {
  // outer 草在左下角 → 旋转到目标角（草体保持在象限的「中心侧」角）
  TL_OUTER: { base: "outer", flipH: false, flipV: false, rot: 270 }, // 草在 TL 象限右下（中心）
  TR_OUTER: { base: "outer", flipH: false, flipV: false, rot: 0 },   // 草在 TR 象限左下（中心）
  BL_OUTER: { base: "outer", flipH: false, flipV: false, rot: 180 }, // 草在 BL 象限右上（中心）
  BR_OUTER: { base: "outer", flipH: false, flipV: false, rot: 90 },  // 草在 BR 象限左上（中心）
  // inner 凹口在右上角 → 旋转到目标凹口（指向瓦片外角）
  TL_INNER: { base: "inner", flipH: false, flipV: false, rot: 90 },  // 凹口在 BR（右下）
  TR_INNER: { base: "inner", flipH: false, flipV: false, rot: 180 }, // 凹口在 BL（左下）
  BL_INNER: { base: "inner", flipH: false, flipV: false, rot: 0 },   // 凹口在 TR（右上）
  BR_INNER: { base: "inner", flipH: false, flipV: false, rot: 270 }, // 凹口在 TL（左上）
  TOP_EDGE: { base: "edge", flipH: false, flipV: false, rot: 0 },
  BOTTOM_EDGE: { base: "edge", flipH: false, flipV: true, rot: 0 },
  LEFT_EDGE: { base: "edge", flipH: false, flipV: false, rot: 270 },
  RIGHT_EDGE: { base: "edge", flipH: false, flipV: false, rot: 90 },
  CENTER_SOLID: { base: "solid", flipH: false, flipV: false, rot: 0 },
  EMPTY_DIRT: { base: "empty", flipH: false, flipV: false, rot: 0 },
}

// 切图模式（Mode B）47 拼合的角槽方位修正（参考图对照）：
//  - 简化 5 块模式：外角补偿 +90°（顺时针）、内角补偿 -90°（逆时针）——已验证正确
//  - 完整 13 块模式：不补偿（0°）
// 只在切图模式（generateQuadrantStitch）生效，不影响模式 A（deriveTilesFromBase）。
export const B47_SLOT_ROT_SIMPLE: Partial<Record<SlotKey, number>> = {
  TL_OUTER: 90,
  TR_OUTER: 90,
  BL_OUTER: 90,
  BR_OUTER: 90,
  TL_INNER: -90,
  TR_INNER: -90,
  BL_INNER: -90,
  BR_INNER: -90,
}

/** 返回当前映射表对应的槽位键列表，避免 16/47 混用同一套槽集 */
export function slotKeysForType(t: MappingType, blob47Simplified = false): string[] {
  if (t === "16") return DUAL16_SLOT_KEYS as string[]
  return (blob47Simplified ? BLOB5_SLOT_KEYS : SLOT_ORDER) as string[]
}
/** 返回当前映射表对应的空槽位对象，供 store 初始化/重置 */
export function emptySlotsForType(
  t: MappingType,
  blob47Simplified = false,
): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const k of slotKeysForType(t, blob47Simplified)) out[k] = null
  return out
}

type Quadrant = "TL" | "TR" | "BL" | "BR"

// For each quadrant:
//   vert  = the vertical  cardinal neighbour (n / s)
//   horiz = the horizontal cardinal neighbour (w / e)
//   diag  = the diagonal neighbour between them
//   vertEdge  = horizontal-running edge art used when ONLY horiz is grass
//   horizEdge = vertical-running   edge art used when ONLY vert  is grass
//
// IMPORTANT (rotation fix): when the vertical neighbour is EMPTY but the
// horizontal neighbour is GRASS, the grass boundary runs HORIZONTALLY, so we
// must use TOP_EDGE / BOTTOM_EDGE. Conversely when only the vertical neighbour
// is grass, the boundary runs VERTICALLY → LEFT_EDGE / RIGHT_EDGE.
const QUAD_DEF: Record<
  Quadrant,
  {
    vert: keyof NeighborBits
    horiz: keyof NeighborBits
    diag: keyof NeighborBits
    horizontalEdge: SlotKey
    verticalEdge: SlotKey
  }
> = {
  TL: { vert: "n", horiz: "w", diag: "nw", horizontalEdge: "TOP_EDGE", verticalEdge: "LEFT_EDGE" },
  TR: { vert: "n", horiz: "e", diag: "ne", horizontalEdge: "TOP_EDGE", verticalEdge: "RIGHT_EDGE" },
  BL: { vert: "s", horiz: "w", diag: "sw", horizontalEdge: "BOTTOM_EDGE", verticalEdge: "LEFT_EDGE" },
  BR: { vert: "s", horiz: "e", diag: "se", horizontalEdge: "BOTTOM_EDGE", verticalEdge: "RIGHT_EDGE" },
}

// The 4 "外角" (outer corner) slots: the grass forms a protruding tip that
// points INTO this quadrant.  Example: TL_OUTER art has its grass tip pointing
// toward top-left, so it is used when the TL quadrant is an outer corner.
const OUTER_OF: Record<Quadrant, SlotKey> = {
  TL: "TL_OUTER",
  TR: "TR_OUTER",
  BL: "BL_OUTER",
  BR: "BR_OUTER",
}

// The 4 "内角" (inner / concave corner) slots: dirt bites in from the diagonal,
// so the grass body sits toward the OPPOSITE quadrant.  Example: in the BR
// quadrant a concave notch means dirt comes from bottom-right and grass wraps
// around the top-left → that shape matches the TL_INNER artwork.
const INNER_OF: Record<Quadrant, SlotKey> = {
  TL: "BR_INNER",
  TR: "BL_INNER",
  BL: "TR_INNER",
  BR: "TL_INNER",
}

// Decide which of the 13 slots fills a given quadrant of a tile.
//
// The tile itself is always grass (mask ≠ 0). For each quadrant we look at the
// vertical cardinal, the horizontal cardinal and the diagonal between them:
//
//   !vert && !horiz          → OUTER corner   (protruding tip)
//   !vert &&  horiz          → HORIZONTAL edge (top / bottom)
//    vert && !horiz          → VERTICAL   edge (left / right)
//    vert &&  horiz && !diag → INNER corner    (concave notch)
//    vert &&  horiz &&  diag → CENTER SOLID
function slotForQuadrant(q: Quadrant, bits: NeighborBits): SlotKey {
  const def = QUAD_DEF[q]
  const vert = !!bits[def.vert]
  const horiz = !!bits[def.horiz]
  const diag = !!bits[def.diag]

  // Both cardinals empty → outer protruding corner (grass tip)
  if (!vert && !horiz) return OUTER_OF[q]
  // Only the horizontal neighbour is grass → boundary runs horizontally
  if (!vert && horiz) return def.horizontalEdge
  // Only the vertical neighbour is grass → boundary runs vertically
  if (vert && !horiz) return def.verticalEdge
  // Both cardinals present but no diagonal → inner concave corner
  if (!diag) return INNER_OF[q]
  // Fully surrounded → solid center
  return "CENTER_SOLID"
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
    Q("bg", false, false, 0, 1, destX + half, destY)
    Q("bg", false, false, 0, 2, destX, destY + half)
    Q("convex", false, false, 270, 3, destX + half, destY + half)
    return
  }
  if (mask === 0b0110) {
    // TR+BL 草：TR 象限放草在 TR（convex 顺时针180°），BL 象限放草在 BL（convex 原样）
    Q("bg", false, false, 0, 0, destX, destY)
    Q("convex", false, false, 180, 1, destX + half, destY)
    Q("convex", false, false, 0, 2, destX, destY + half)
    Q("bg", false, false, 0, 3, destX + half, destY + half)
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
// (已废弃：16 模式现在统一走 4-bit→8-bit 转换 + slotForQuadrant 路径)

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
 * 简化模式：把某个 13 槽形状对应的 5 基础块之一，经 flip/rot 变换后
 * 绘制到目标象限。源为基础块（完整 tileSize），目标为象限（size = tileSize/2），
 * 缩小绘制使形状比例保持不变。
 */
function drawQuadrantTransformed(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  xf: { flipH: boolean; flipV: boolean; rot: number },
  dx: number,
  dy: number,
  size: number,
) {
  // 源基础块可能是完整 tileSize（手绘派生，缩小绘制）或 qSize（Mode B 切片，1:1），
  // 用 src.width 作为源尺寸避免越界与比例错配。
  const s = src.width
  ctx.save()
  ctx.translate(dx + size / 2, dy + size / 2)
  if (xf.rot !== 0) ctx.rotate((xf.rot * Math.PI) / 180)
  if (xf.flipH) ctx.scale(-1, 1)
  if (xf.flipV) ctx.scale(1, -1)
  ctx.drawImage(src, 0, 0, s, s, -size / 2, -size / 2, size, size)
  ctx.restore()
}

/**
 * Quadrant Stitching generator (13-slot).
 *
 * The imported image is divided into cells of `gridSize × gridSize`. Each of the
 * 13 slots picks one such cell as its source art. The output autotile is
 * `tileSize = gridSize * 2`, split into 4 quadrants each exactly `gridSize`.
 * For every mask we decide which slot fills which quadrant and draw the whole
 * slot canvas (`gridSize × gridSize`) into that quadrant — matching the classic
 * reference implementation where SUB_SIZE=16, TILE_SIZE=32.
 */
export function generateQuadrantStitch(
  imageDataUrl: string,
  gridSize: number,
  slots: Record<string, string | null>,
  mappingType: MappingType,
  tileSize: number,
  blob47Simplified = false,
): Promise<ModeBTemplateResult> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      try {
        const outTileSize = Math.max(1, tileSize)
        const isDual16 = mappingType === "16"
        // 47 模式下每个象限的目标尺寸 = 输出瓦片的一半。源切片也裁成这个尺寸，
        // 使「源 → 象限」缩放比为 1:1，避免瓦片间产生亚像素缝隙。
        const qSize = Math.max(1, Math.round(outTileSize / 2))

        // 16 模式：5 个基础块，切片尺寸 = 整块 tileSize（参照参考图16，源图每格是完整瓦片）
        // 47 模式 / 简化模式：切片尺寸 = qSize（半块）
        const isSimple47 = !isDual16 && blob47Simplified
        const slotKeys = isDual16
          ? (DUAL16_SLOT_KEYS as string[])
          : isSimple47
            ? (BLOB5_SLOT_KEYS as string[])
            : (SLOT_ORDER as string[])
        const slotLabels = isDual16 ? DUAL16_LABELS : isSimple47 ? BLOB5_LABELS : SLOT_LABELS
        // 每个瓦片在 sheet 上的步长：16 模式 = outTileSize；47 模式 = 2*qSize（整数对齐）
        const genTile = isDual16 ? outTileSize : Math.max(1, 2 * qSize)
        const sliceSize = isDual16 ? outTileSize : qSize

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
          const renderMask = (ctx: CanvasRenderingContext2D, mask: number, x: number, y: number) => {
            if (mask === 0b1001) {
              // TL+BR 草：TR/BL 用空白块填充（不留透明）
              quad(ctx, "convex", false, false, 270, 0, x, y)
              quad(ctx, "bg", false, false, 0, 1, x + half, y)
              quad(ctx, "bg", false, false, 0, 2, x, y + half)
              quad(ctx, "convex", false, false, 90, 3, x + half, y + half)
              return
            }
            if (mask === 0b0110) {
              // TR+BL 草：TL/BR 用空白块填充（不留透明）
              quad(ctx, "bg", false, false, 0, 0, x, y)
              quad(ctx, "convex", false, false, 0, 1, x + half, y)
              quad(ctx, "convex", false, false, 180, 2, x, y + half)
              quad(ctx, "bg", false, false, 0, 3, x + half, y + half)
              return
            }
            drawSpecTile16(ctx, dualSlots, mask, x, y, outTileSize)
          }
          order.forEach((mask, idx) => {
            if (mask === null) return
            const tx = (idx % columns) * genTile
            const ty = Math.floor(idx / columns) * genTile
            renderMask(sctx, mask, tx, ty)
            // 单独导出一份该 mask 的瓦片（供测试地图/tilesheet 使用）
            const tc = document.createElement("canvas")
            tc.width = outTileSize
            tc.height = outTileSize
            const tctx = tc.getContext("2d", { willReadFrequently: true })
            if (tctx) {
              tctx.imageSmoothingEnabled = false
              renderMask(tctx, mask, 0, 0)
            }
            tiles.set(mask, tc)
          })
        } else {
          // 47-blob：瓦片尺寸 = genTile（外层已算 = 2*qSize），整数对齐无拉伸缝。
          order.forEach((mask, idx) => {
            if (mask === null) return
            const tx = (idx % columns) * genTile
            const ty = Math.floor(idx / columns) * genTile
            const bits = bitsFor47(mask)

            const tileCanvas = document.createElement("canvas")
            tileCanvas.width = genTile
            tileCanvas.height = genTile
            const tctx = tileCanvas.getContext("2d", { willReadFrequently: true })
            if (!tctx) {
              reject(new Error("无法创建瓦片画布"))
              return
            }
            tctx.imageSmoothingEnabled = false

            const quadrants: { q: Quadrant; dx: number; dy: number }[] = [
              { q: "TL", dx: 0, dy: 0 },
              { q: "TR", dx: qSize, dy: 0 },
              { q: "BL", dx: 0, dy: qSize },
              { q: "BR", dx: qSize, dy: qSize },
            ]
            for (const { q, dx, dy } of quadrants) {
              const slotKey = slotForQuadrant(q, bits)
              // 参考图对照修正：仅简化 5 块模式需要角槽旋转补偿，完整 13 块模式不补偿。
              const extraRot = isSimple47 ? (B47_SLOT_ROT_SIMPLE[slotKey] ?? 0) : 0
              if (isSimple47) {
                // 简化模式：把 13 槽形状映射到 5 基础块 + 变换
                const xf = BLOB5_XF[slotKey]
                const src = slotCanvases[xf.base]
                if (!src) continue
                drawQuadrantTransformed(tctx, src, { ...xf, rot: xf.rot + extraRot }, dx, dy, qSize)
              } else {
                const src = slotCanvases[slotKey]
                if (!src) continue
                if (extraRot !== 0) {
                  drawQuadrantTransformed(tctx, src, { flipH: false, flipV: false, rot: extraRot }, dx, dy, qSize)
                } else {
                  tctx.drawImage(src, 0, 0, qSize, qSize, dx, dy, qSize, qSize)
                }
              }
            }

            sctx.drawImage(tileCanvas, tx, ty, genTile, genTile)
            tiles.set(mask, tileCanvas)
          })
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

// Convert an 8-bit neighbour mask into neighbour bits (47-blob system).
export function maskToBits(mask: number): NeighborBits {
  return bitsFor47(mask)
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
 *  - 47 模式：5 个半块基础块 → BLOB5_XF 逐象限拼出 BLOB_STANDARD_ORDER 中的全部 mask
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

  // 47 模式：简化 5 块路径（手绘画布只有 5 块半块）
  const qSize = Math.max(1, Math.round(tileSize / 2))
  const genTile = Math.max(1, 2 * qSize)
  const quadrants: { q: Quadrant; dx: number; dy: number }[] = [
    { q: "TL", dx: 0, dy: 0 },
    { q: "TR", dx: qSize, dy: 0 },
    { q: "BL", dx: 0, dy: qSize },
    { q: "BR", dx: qSize, dy: qSize },
  ]
  const order = BLOB_STANDARD_ORDER.filter((m) => m !== null) as number[]
  for (const mask of order) {
    const bits = bitsFor47(mask)
    const tc = document.createElement("canvas")
    tc.width = genTile
    tc.height = genTile
    const tctx = tc.getContext("2d", { willReadFrequently: true })
    if (!tctx) continue
    tctx.imageSmoothingEnabled = false
    for (const { q, dx, dy } of quadrants) {
      const slotKey = slotForQuadrant(q, bits)
      const xf = BLOB5_XF[slotKey]
      const src = baseCanvases[xf.base]
      if (!src) continue
      drawQuadrantTransformed(tctx, src, xf, dx, dy, qSize)
    }
    tiles.set(mask, tc)
  }
  return tiles
}
