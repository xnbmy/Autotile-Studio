export type MappingType = "16" | "47"

// 统一工作台的左侧输入源：手绘不再是独立来源 —— 中间画布永远可手绘，
// 手绘/切片固化通过 baseDirty 脏标记与参数实时生成互斥（防误触闸门）。
export type SourceMode = "procedural" | "slice"

// 画布视口（存入 store，跨挂载/切页记忆）
export interface CanvasView {
  zoom: number
  tx: number
  ty: number
}

export interface MapView {
  zoom: number
  px: number
  py: number
}

// 13 base slots of the Quadrant Stitching autotile algorithm (47-blob mode):
// 4 outer corners, 4 inner corners, 4 edges, 1 solid center, 1 empty background.
export type SlotKey =
  | "TL_OUTER"
  | "TR_OUTER"
  | "BL_OUTER"
  | "BR_OUTER"
  | "TL_INNER"
  | "TR_INNER"
  | "BL_INNER"
  | "BR_INNER"
  | "TOP_EDGE"
  | "LEFT_EDGE"
  | "RIGHT_EDGE"
  | "BOTTOM_EDGE"
  | "CENTER_SOLID"
  | "EMPTY_DIRT"

// 5 base slots of the Dual-Grid 16-tile mode (参照参考实现图16)：
// convex=左上外角(1000)、concave=左上内角(0111)、edge=上边(1100)、
// fg=全图(1111)、bg=空白(0000)。其余变体由这 5 块经翻转/旋转程序化生成。
export type Dual16SlotKey = "convex" | "concave" | "edge" | "fg" | "bg"

// 47-blob 的「简化模式」槽集：13 槽在对称性下其实只有 5 类形状，
// 4 外角 / 4 内角 / 4 边缘 分别是同一份美术的镜像或旋转。
// outer=左上外角、inner=左上内角、edge=上边缘、solid=全实中心、empty=空背景。
// 其余 8 个槽在生成时由这 5 块经 flip/rot 程序化推导。
// 注意：素材若非对称（单侧高光、朝向性草叶、投影等），镜像会穿帮，此时应关闭简化模式。
export type Blob5SlotKey = "outer" | "inner" | "edge" | "solid" | "empty"

export interface GenParams {
  color: string
  erosionStrength: number
  edgeThickness: number
  // 边缘高光强度 (0..1)：0 = 关闭边缘阴影/高光带（纯色平铺），
  // >0 = 在腐蚀边缘外沿绘制阴影带 + 高光带，与 16 双网格算法风格统一。
  edgeHighlight: number
  seed: number
}

export interface TileAsset {
  id: string
  name: string
  kind: "autotile"
  mappingType: MappingType
  tileSize: number
  params: GenParams
  tiles: Map<number, HTMLCanvasElement>
  thumbnail: string
  createdAt: number
}

export interface DualAsset {
  id: string
  name: string
  kind: "dualgrid"
  tileSize: number
  grassColor: string
  dirtColor: string
  gradient: boolean
  tiles: Map<number, HTMLCanvasElement>
  thumbnail: string
  createdAt: number
}

export type LibraryAsset = TileAsset | DualAsset

export interface ModeBTemplateResult {
  canvas: HTMLCanvasElement
  width: number
  height: number
  tileSize: number
  mappingType: MappingType
  // 每个槽位绑定的源图格子坐标（"col,row"），供 UI 回显该槽取自源图哪一块。
  // 键为当前映射表的槽位名（47 用 SlotKey，16 用 Dual16SlotKey）。
  slots: Record<string, string | null>
  // assembled tiles keyed by mask, for the tilesheet + test map
  tiles: Map<number, HTMLCanvasElement>
  columns: number
  rows: number
}

export interface AutotileLayer {
  id: string
  kind: "autotile"
  name: string
  assetId: string
  visible: boolean
  cells: Set<string>
}

export interface DualGridLayer {
  id: string
  kind: "dualgrid"
  name: string
  dualAssetId: string
  visible: boolean
  cells: Map<string, 0 | 1>
}

export type Layer = AutotileLayer | DualGridLayer

export const DEFAULT_GEN_PARAMS: GenParams = {
  color: "#6fae4a",
  erosionStrength: 0.5,
  edgeThickness: 2,
  edgeHighlight: 0.5,
  seed: 12345,
}

// ── 手绘（Mode C）数据模型 ───────────────────────────────────────────────
// D1：手绘统一走「5 块简化模式」。16 映射用 Dual16SlotKey（整块），
// 47 映射用 Blob5SlotKey（半块），均由 flip/rot 推导其余槽位。
export type BaseSlotKey = Dual16SlotKey | Blob5SlotKey

// 5 块基础像素画布：一等可编辑对象。键随当前 mappingType 变化。
export type BaseCanvases = Record<string, HTMLCanvasElement>

// 单格微调覆盖：键为 16/47 总览中某格（或某 mask）的标识，值为手绘像素画布。
export type Overrides = Record<string, HTMLCanvasElement>

// 手绘画笔等像素级工具（P2 接实，P1 仅建骨架）
export type DrawTool = "pencil" | "eraser" | "picker" | "fill" | "rect" | "line"
