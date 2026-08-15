"use client"

import { create } from "zustand"
import { nanoid } from "nanoid"
import type { AutotileLayer, BaseCanvases, CanvasView, DrawTool, DualAsset, DualGridLayer, GenParams, Layer, LibraryAsset, MappingType, MapView, Overrides, SourceMode, TileAsset } from "./types"
import { DEFAULT_GEN_PARAMS } from "./types"
import { emptySlotsForType, slotKeysForType } from "./quadrant-stitch"
import { generateBaseCanvases } from "./asset-factory"

/** 按像素深拷贝一张画布（撤销快照必须与活跃画布完全独立） */
function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas")
  out.width = src.width
  out.height = src.height
  const octx = out.getContext("2d", { willReadFrequently: true })
  const sctx = src.getContext("2d", { willReadFrequently: true })
  if (octx && sctx) {
    octx.putImageData(sctx.getImageData(0, 0, src.width, src.height), 0, 0)
  }
  return out
}

/** 深拷贝整组基础画布（P2.5：撤销栈改为像素级快照） */
function deepCopyCanvases(bases: BaseCanvases): BaseCanvases {
  const out: BaseCanvases = {}
  for (const [k, v] of Object.entries(bases)) out[k] = cloneCanvas(v)
  return out
}

/** 深拷贝单格微调覆盖画布（随撤销栈一起快照） */
function deepCopyOverrides(ov: Overrides): Overrides {
  const out: Overrides = {}
  for (const [k, v] of Object.entries(ov)) out[k] = cloneCanvas(v)
  return out
}

/** 撤销/重做快照：基础画布 + 单格微调覆盖 + 脏标记 */
interface CanvasSnapshot {
  baseCanvases: BaseCanvases
  overrides: Overrides
  baseDirty: boolean
}

interface EditorState {
  // 左侧输入源：procedural（参数生成）/ slice（导入切片）；手绘在中间画布随时可用
  sourceMode: SourceMode
  setSourceMode: (m: SourceMode) => void

  mappingType: MappingType
  setMappingType: (t: MappingType) => void

  tileSize: number
  setTileSize: (n: number) => void

  // 手动覆盖瓦片尺寸：关闭=自动（按映射表/算法推算切格尺寸），开启=手动指定
  tileSizeManual: boolean
  setTileSizeManual: (v: boolean) => void

  // 手动覆盖切片粒度（源图网格）：关闭=自动（16块→round(tileSize/2)，47块→32），开启=手动指定
  gridSizeManual: boolean
  setGridSizeManual: (v: boolean) => void

  genParams: GenParams
  setGenParams: (p: Partial<GenParams>) => void

  // ── 参数 ↔ 基础块联动（防误触闸门）──────────────────────────────
  // 基础块/单格微调包含参数之外的修改（手绘笔触、切片固化、总览微调）。
  // 脏状态下参数变化不会自动覆写画布，需经确认条（确认覆写 / 锁定手绘 / 还原参数）。
  baseDirty: boolean
  setBaseDirty: (v: boolean) => void
  // 锁定手绘：彻底切断参数对基础块的写入（硬闸），解锁前参数仅影响预览
  baseLocked: boolean
  setBaseLocked: (v: boolean) => void
  // 参数已变化但尚未应用到基础块（触发确认条 / 实时重生成）
  paramDirty: boolean
  // 最近一次写入基础块所用参数（供「还原参数」回退）
  lastGenParams: GenParams
  // 按当前参数重生成 5 块基础块：清空微调与撤销栈，解除脏状态
  regenerateBaseFromParams: () => void
  // 放弃未应用的参数修改，回退到最近一次写入基础块的参数
  revertGenParams: () => void

  assets: TileAsset[]
  addAsset: (a: TileAsset) => void
  removeAsset: (id: string) => void
  updateAssetTile: (assetId: string, mask: number, canvas: HTMLCanvasElement) => void

  dualAssets: DualAsset[]
  addDualAsset: (a: DualAsset) => void
  removeDualAsset: (id: string) => void

  gridW: number
  gridH: number

  layers: Layer[]
  activeLayerId: string | null
  addAutotileLayer: (assetId: string, name: string) => void
  addDualGridLayer: (dualAssetId: string, name: string) => void
  removeLayer: (id: string) => void
  setActiveLayer: (id: string) => void
  toggleLayerVisible: (id: string) => void
  paintAutotileCells: (layerId: string, keys: string[], filled: boolean) => void
  paintDualCells: (layerId: string, keys: string[], value: 0 | 1) => void
  floodFillAutotile: (layerId: string, startX: number, startY: number, filled: boolean) => void

  // ── 画布视口（存 store 以跨挂载/切页记忆）──────────────────────
  centerView: CanvasView
  setCenterView: (v: CanvasView | ((prev: CanvasView) => CanvasView)) => void
  testView: MapView
  setTestView: (v: MapView | ((prev: MapView) => MapView)) => void

  // Mode B state — 16 模式(5 基础块) / 47 模式(13 槽) 共用，按 mappingType 区分槽集
  modeBImage: string | null
  modeBImageSize: { w: number; h: number } | null
  modeBGridSize: number
  modeBSelectedSlice: { srcCol: number; srcRow: number } | null
  modeBSlot: string
  modeBSlots: Record<string, string | null>
  setModeBImage: (dataUrl: string | null, size: { w: number; h: number } | null) => void
  setModeBGridSize: (n: number) => void
  setModeBSelectedSlice: (slice: { srcCol: number; srcRow: number } | null) => void
  setModeBSlot: (s: string) => void
  assignModeBCell: (slot: string, key: string) => void
  clearModeBSlots: () => void

  // ── 手绘（draw）状态 ───────────────────────────────────────────────
  // 5 块基础像素画布（一等可编辑对象）：参数实时生成 / 切片固化 / 直接手绘 共用出口
  baseCanvases: BaseCanvases
  setBaseCanvases: (c: BaseCanvases) => void
  // 单格微调覆盖（16/47 总览中按 mask 覆写派生瓦片）
  overrides: Overrides
  setOverrides: (o: Overrides) => void
  setOverride: (mask: number, canvas: HTMLCanvasElement) => void
  clearOverride: (mask: number) => void
  clearAllOverrides: () => void

  // 绘制工具箱状态
  drawTool: DrawTool
  setDrawTool: (t: DrawTool) => void
  drawTileTransparent: boolean // ∞ 通透绘制开关
  setDrawTileTransparent: (v: boolean) => void
  drawTileColorDiff: boolean // 通透绘制色差显示开关（周围副本半透明偏暗）
  setDrawTileColorDiff: (v: boolean) => void
  drawShowGrid: boolean // 像素网格显示开关
  setDrawShowGrid: (v: boolean) => void
  // 画笔/橡皮大小（像素，1~16），同一控件同时调节
  brushSize: number
  setBrushSize: (v: number) => void
  // 手绘笔刷颜色（RGBA）
  drawColor: { r: number; g: number; b: number; a: number }
  // 笔刷颜色历史槽（10 个，快捷键 1~9/0 对应）：修改颜色时从左往右循环覆盖
  colorSlots: ({ r: number; g: number; b: number; a: number } | null)[]
  nextColorSlot: number
  commitDrawColor: (c: { r: number; g: number; b: number; a: number }) => void
  pickColorSlot: (i: number) => void

  // 撤销/重做：baseCanvases + overrides + baseDirty 快照栈
  undoStack: CanvasSnapshot[]
  redoStack: CanvasSnapshot[]
  pushUndo: () => void
  undo: () => void
  redo: () => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  sourceMode: "procedural",
  setSourceMode: (m) => set({ sourceMode: m }),

  mappingType: "16",
  setMappingType: (t) => {
    if (t === get().mappingType) return
    const ts = get().tileSize
    // 自动推算切片粒度：16 模式整块切片→tileSize，47 模式半块→固定 32
    const autoGrid = t === "16" ? Math.max(1, Math.round(ts)) : 32
    // 切换映射表时彻底重置为对应模式的独立空槽集，避免 16/47 混用
    const slots = emptySlotsForType(t)
    const firstSlot = slotKeysForType(t)[0]
    const patch: Partial<EditorState> = {
      mappingType: t,
      modeBGridSize: autoGrid,
      gridSizeManual: false,
      modeBSlots: slots,
      modeBSlot: firstSlot,
    }
    // 基础块槽位键随映射表变化（16↔47），旧基础像素一律失效：
    //  - 参数主导（未脏未锁）的干净基础块：按新映射直接重生成，保持实时联动
    //  - 手绘/切片固化的脏基础块：清空，回到参数实时生成
    if (Object.keys(get().baseCanvases).length > 0) {
      const { baseDirty, baseLocked, tileSize, genParams } = get()
      if (!baseDirty && !baseLocked) {
        patch.baseCanvases = generateBaseCanvases(t, tileSize, genParams)
        patch.lastGenParams = { ...genParams }
      } else {
        patch.baseCanvases = {}
      }
      patch.overrides = {}
      patch.undoStack = []
      patch.redoStack = []
      patch.baseDirty = false
      patch.paramDirty = false
    }
    set(patch)
  },

  tileSize: 32,
  setTileSize: (n) => {
    const { mappingType, gridSizeManual } = get()
    // 未手动覆盖切片粒度时，随图块大小自动重算中间格子
    const autoGrid =
      mappingType === "16" ? Math.max(1, Math.round(n)) : 32
    set({
      tileSize: n,
      modeBGridSize: gridSizeManual ? get().modeBGridSize : autoGrid,
    })
  },

  tileSizeManual: false,
  setTileSizeManual: (v) => set({ tileSizeManual: v }),

  gridSizeManual: false,
  setGridSizeManual: (v) => set({ gridSizeManual: v }),

  genParams: { ...DEFAULT_GEN_PARAMS },
  setGenParams: (p) => set({ genParams: { ...get().genParams, ...p }, paramDirty: true }),

  baseDirty: false,
  setBaseDirty: (v) => set({ baseDirty: v }),
  baseLocked: false,
  setBaseLocked: (v) => set({ baseLocked: v }),
  paramDirty: false,
  lastGenParams: { ...DEFAULT_GEN_PARAMS },
  regenerateBaseFromParams: () => {
    const { mappingType, tileSize, genParams } = get()
    set({
      baseCanvases: generateBaseCanvases(mappingType, tileSize, genParams),
      overrides: {},
      undoStack: [],
      redoStack: [],
      baseDirty: false,
      paramDirty: false,
      lastGenParams: { ...genParams },
    })
  },
  revertGenParams: () =>
    set({ genParams: { ...get().lastGenParams }, paramDirty: false }),

  assets: [],
  addAsset: (a) => set({ assets: [a, ...get().assets] }),
  removeAsset: (id) => set({ assets: get().assets.filter((a) => a.id !== id) }),
  updateAssetTile: (assetId, mask, canvas) =>
    set({
      assets: get().assets.map((a) => {
        if (a.id !== assetId) return a
        const tiles = new Map(a.tiles)
        tiles.set(mask, canvas)
        return { ...a, tiles }
      }),
    }),

  dualAssets: [],
  addDualAsset: (a) => set({ dualAssets: [a, ...get().dualAssets] }),
  removeDualAsset: (id) => set({ dualAssets: get().dualAssets.filter((a) => a.id !== id) }),

  gridW: 24,
  gridH: 16,

  layers: [],
  activeLayerId: null,
  addAutotileLayer: (assetId, name) => {
    const layer: AutotileLayer = { id: nanoid(8), kind: "autotile", name, assetId, visible: true, cells: new Set() }
    set({ layers: [...get().layers, layer], activeLayerId: layer.id })
  },
  addDualGridLayer: (dualAssetId, name) => {
    const layer: DualGridLayer = { id: nanoid(8), kind: "dualgrid", name, dualAssetId, visible: true, cells: new Map() }
    set({ layers: [...get().layers, layer], activeLayerId: layer.id })
  },
  removeLayer: (id) => {
    const layers = get().layers.filter((l) => l.id !== id)
    const activeLayerId = get().activeLayerId === id ? (layers[0]?.id ?? null) : get().activeLayerId
    set({ layers, activeLayerId })
  },
  setActiveLayer: (id) => set({ activeLayerId: id }),
  toggleLayerVisible: (id) => set({ layers: get().layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)) }),
  paintAutotileCells: (layerId, keys, filled) => {
    set({
      layers: get().layers.map((l) => {
        if (l.id !== layerId || l.kind !== "autotile") return l
        const cells = new Set(l.cells)
        for (const k of keys) {
          if (filled) cells.add(k)
          else cells.delete(k)
        }
        return { ...l, cells }
      }),
    })
  },
  paintDualCells: (layerId, keys, value) => {
    set({
      layers: get().layers.map((l) => {
        if (l.id !== layerId || l.kind !== "dualgrid") return l
        const cells = new Map(l.cells)
        for (const k of keys) cells.set(k, value)
        return { ...l, cells }
      }),
    })
  },
  floodFillAutotile: (layerId, startX, startY, filled) => {
    const layer = get().layers.find((l) => l.id === layerId)
    if (!layer || layer.kind !== "autotile") return
    const { gridW, gridH } = get()
    const cells = new Set(layer.cells)
    const target = cells.has(`${startX},${startY}`)
    if (target === filled) return
    const stack = [[startX, startY]]
    const seen = new Set<string>()
    while (stack.length) {
      const [x, y] = stack.pop()!
      if (x < 0 || y < 0 || x >= gridW || y >= gridH) continue
      const key = `${x},${y}`
      if (seen.has(key)) continue
      seen.add(key)
      const has = cells.has(key)
      if (has !== target) continue
      if (filled) cells.add(key)
      else cells.delete(key)
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
    }
    set({
      layers: get().layers.map((l) => {
        if (l.id !== layerId || l.kind !== "autotile") return l
        return { ...l, cells }
      }),
    })
  },

  centerView: { zoom: 3, tx: 0, ty: 0 },
  setCenterView: (v) =>
    set((s) => ({ centerView: typeof v === "function" ? v(s.centerView) : v })),
  testView: { zoom: 1, px: 0, py: 0 },
  setTestView: (v) =>
    set((s) => ({ testView: typeof v === "function" ? v(s.testView) : v })),

  modeBImage: null,
  modeBImageSize: null,
  modeBGridSize: 32,
  modeBSelectedSlice: null,
  modeBSlot: "convex",
  modeBSlots: emptySlotsForType("16"),
  setModeBImage: (dataUrl, size) => {
    const { mappingType, tileSize, gridSizeManual } = get()
    // 自动推算切片粒度：16块→tileSize，47块→固定32
    const autoGrid =
      mappingType === "16" ? Math.max(1, Math.round(tileSize)) : 32
    // 自动模式（未手动覆盖）下首次导入图片时，按映射表重新推算网格尺寸，
    // 并确保网格不超过图片宽高，避免默认残留 32 导致切格错误
    const nextGrid =
      dataUrl && !gridSizeManual && size
        ? Math.max(1, Math.min(autoGrid, size.w, size.h))
        : get().modeBGridSize
    set({
      modeBImage: dataUrl,
      modeBImageSize: size,
      modeBGridSize: nextGrid,
    })
  },
  setModeBGridSize: (n) => set({ modeBGridSize: n }),
  setModeBSelectedSlice: (slice) => set({ modeBSelectedSlice: slice }),
  setModeBSlot: (s) => set({ modeBSlot: s }),
  assignModeBCell: (slot, key) => {
    const slots = { ...get().modeBSlots, [slot]: key }
    // 绑定后自动跳到下一个未选中的槽位（按当前映射表的槽序）
    const next = slotKeysForType(get().mappingType).find((k) => !slots[k])
    set({ modeBSlots: slots, ...(next ? { modeBSlot: next } : {}) })
  },
  clearModeBSlots: () =>
    set({
      modeBSlots: emptySlotsForType(get().mappingType),
      modeBSlot: slotKeysForType(get().mappingType)[0],
    }),

  baseCanvases: {},
  setBaseCanvases: (c) => set({ baseCanvases: c }),
  overrides: {},
  setOverrides: (o) => set({ overrides: o }),
  setOverride: (mask, canvas) =>
    // 单格微调属于参数之外的修改，一并纳入脏标记保护
    set((s) => ({ overrides: { ...s.overrides, [String(mask)]: canvas }, baseDirty: true })),
  clearOverride: (mask) =>
    set((s) => {
      const overrides = { ...s.overrides }
      delete overrides[String(mask)]
      return { overrides }
    }),
  clearAllOverrides: () => set({ overrides: {} }),

  drawTool: "pencil",
  setDrawTool: (t) => set({ drawTool: t }),
  drawTileTransparent: false,
  setDrawTileTransparent: (v) => set({ drawTileTransparent: v }),
  drawTileColorDiff: true,
  setDrawTileColorDiff: (v) => set({ drawTileColorDiff: v }),
  drawShowGrid: true,
  setDrawShowGrid: (v) => set({ drawShowGrid: v }),
  brushSize: 1,
  setBrushSize: (v) => set({ brushSize: Math.max(1, Math.min(16, Math.round(v))) }),
  drawColor: { r: 74, g: 174, b: 128, a: 255 }, // #4ade80
  // 颜色槽初始为空（10 个），首次修改颜色时从左往右填充
  colorSlots: Array.from({ length: 10 }, () => null),
  nextColorSlot: 0,
  // 修改颜色：写入当前槽 → 设为当前颜色 → 槽指针右移（到末尾循环回第 1 格）
  commitDrawColor: (c) =>
    set((s) => {
      const slots = [...s.colorSlots]
      slots[s.nextColorSlot] = c
      return {
        colorSlots: slots,
        nextColorSlot: (s.nextColorSlot + 1) % s.colorSlots.length,
        drawColor: c,
      }
    }),
  // 快捷键/点击切换：只设为当前颜色，不入槽
  pickColorSlot: (i) =>
    set((s) => {
      const c = s.colorSlots[i]
      if (!c) return {}
      return { drawColor: c }
    }),

  undoStack: [],
  redoStack: [],
  pushUndo: () => {
    // P2.5：像素级深拷贝快照，与活跃画布彻底隔离（画布编辑是原地改 ImageData）
    set((s) => ({
      undoStack: [
        ...s.undoStack,
        {
          baseCanvases: deepCopyCanvases(s.baseCanvases),
          overrides: deepCopyOverrides(s.overrides),
          baseDirty: s.baseDirty,
        },
      ].slice(-50),
      redoStack: [],
    }))
  },
  undo: () => {
    const { undoStack, redoStack, baseCanvases, overrides, baseDirty } = get()
    if (undoStack.length === 0) return
    const prev = undoStack[undoStack.length - 1]
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [
        ...redoStack,
        {
          baseCanvases: deepCopyCanvases(baseCanvases),
          overrides: deepCopyOverrides(overrides),
          baseDirty,
        },
      ],
      baseCanvases: prev.baseCanvases,
      overrides: prev.overrides,
      baseDirty: prev.baseDirty,
    })
  },
  redo: () => {
    const { undoStack, redoStack, baseCanvases, overrides, baseDirty } = get()
    if (redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]
    set({
      redoStack: redoStack.slice(0, -1),
      undoStack: [
        ...undoStack,
        {
          baseCanvases: deepCopyCanvases(baseCanvases),
          overrides: deepCopyOverrides(overrides),
          baseDirty,
        },
      ],
      baseCanvases: next.baseCanvases,
      overrides: next.overrides,
      baseDirty: next.baseDirty,
    })
  },
}))

export function getAllLibraryAssets(state: Pick<EditorState, "assets" | "dualAssets">): LibraryAsset[] {
  return [...state.assets, ...state.dualAssets]
}
