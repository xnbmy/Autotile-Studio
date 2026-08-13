"use client"

import { create } from "zustand"
import { nanoid } from "nanoid"
import type { AppMode, AutotileLayer, BaseCanvases, DrawTool, DualAsset, DualGridLayer, GenParams, Layer, LibraryAsset, MappingType, ModeBTemplateResult, Overrides, SourceMode, TileAsset, ToolType } from "./types"
import { DEFAULT_GEN_PARAMS } from "./types"
import { SLOT_ORDER, emptySlotsForType, slotKeysForType } from "./quadrant-stitch"

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

interface EditorState {
  mode: AppMode
  setMode: (m: AppMode) => void

  // D2：三入口来源模式，与 mode 解耦（procedural→A / slice→B / draw→手绘）
  sourceMode: SourceMode
  setSourceMode: (m: SourceMode) => void

  mappingType: MappingType
  setMappingType: (t: MappingType) => void

  // 47 模式简化开关：开启后只需绑定 5 个基础块，其余 8 槽由 flip/rot 推导
  blob47Simplified: boolean
  setBlob47Simplified: (v: boolean) => void

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

  tool: ToolType
  setTool: (t: ToolType) => void
  zoom: number
  setZoom: (z: number) => void
  pan: { x: number; y: number }
  setPan: (p: { x: number; y: number }) => void

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
  modeBResult: ModeBTemplateResult | null
  setModeBResult: (r: ModeBTemplateResult | null) => void

  // ── 手绘（draw）状态 ───────────────────────────────────────────────
  // 5 块基础像素画布（一等可编辑对象），P1 仅初始化 + 固化写入，P2 接画笔。
  baseCanvases: BaseCanvases
  setBaseCanvases: (c: BaseCanvases) => void
  // 单格微调覆盖（P3 接实，P1 建字段）
  overrides: Overrides
  setOverrides: (o: Overrides) => void

  // 绘制工具箱状态（P1 骨架，P2 接实）
  drawTool: DrawTool
  setDrawTool: (t: DrawTool) => void
  drawTileTransparent: boolean // ∞ 通透绘制开关
  setDrawTileTransparent: (v: boolean) => void
  drawTileColorDiff: boolean // 通透绘制色差显示开关（周围副本半透明偏暗）
  setDrawTileColorDiff: (v: boolean) => void
  drawShowGrid: boolean // 像素网格显示开关
  setDrawShowGrid: (v: boolean) => void

  // 撤销/重做：baseCanvases 快照栈（P2 接实，P1 建字段与空操作）
  undoStack: BaseCanvases[]
  redoStack: BaseCanvases[]
  pushUndo: () => void
  undo: () => void
  redo: () => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  mode: "A",
  setMode: (m) => set({ mode: m }),

  sourceMode: "procedural",
  setSourceMode: (m) => {
    // 与 AppMode 联动：procedural→A、slice→B、draw→A（手绘沿用 A 的映射/图块设置，但走独立画布）
    const modeMap: Record<SourceMode, AppMode> = { procedural: "A", slice: "B", draw: "A" }
    set({ sourceMode: m, mode: modeMap[m] })
  },

  mappingType: "16",
  setMappingType: (t) => {
    if (t === get().mappingType) return
    const ts = get().tileSize
    // 自动推算切片粒度：16 模式整块切片→tileSize，47 模式半块→固定 32
    const autoGrid = t === "16" ? Math.max(1, Math.round(ts)) : 32
    // 切换映射表时彻底重置为对应模式的独立空槽集，避免 16/47 混用
    const simple = get().blob47Simplified
    const slots = emptySlotsForType(t, simple)
    const firstSlot = slotKeysForType(t, simple)[0]
    const patch: Partial<EditorState> = {
      mappingType: t,
      modeBGridSize: autoGrid,
      gridSizeManual: false,
      modeBResult: null,
      modeBSlots: slots,
      modeBSlot: firstSlot,
    }
    // 手绘界面切换映射表时自动切回参数生成：基础像素与映射表绑定，
    // 换映射后旧像素已失效，需重新「固化为像素」，因此一并清空手绘数据。
    if (get().sourceMode === "draw") {
      patch.sourceMode = "procedural"
      patch.mode = "A"
      patch.baseCanvases = {}
      patch.overrides = {}
      patch.undoStack = []
      patch.redoStack = []
    }
    set(patch)
  },

  blob47Simplified: false,
  setBlob47Simplified: (v) => {
    if (v === get().blob47Simplified) return
    // 简化/完整两套槽集语义不同（5 半块 vs 13 槽），切换时重置绑定避免残留错配
    const t = get().mappingType
    const patch: Partial<EditorState> = { blob47Simplified: v }
    if (t === "47") {
      patch.modeBSlots = emptySlotsForType(t, v)
      patch.modeBSlot = slotKeysForType(t, v)[0]
      patch.modeBResult = null
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
  setGenParams: (p) => set({ genParams: { ...get().genParams, ...p } }),

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

  tool: "brush",
  setTool: (t) => set({ tool: t }),
  zoom: 1,
  setZoom: (z) => set({ zoom: Math.max(0.25, Math.min(4, z)) }),
  pan: { x: 0, y: 0 },
  setPan: (p) => set({ pan: p }),

  modeBImage: null,
  modeBImageSize: null,
  modeBGridSize: 32,
  modeBSelectedSlice: null,
  modeBSlot: "convex",
  modeBSlots: emptySlotsForType("16"),
  modeBResult: null,
  setModeBResult: (r) => set({ modeBResult: r }),
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
      modeBResult: null,
    })
  },
  setModeBGridSize: (n) => set({ modeBGridSize: n, modeBResult: null }),
  setModeBSelectedSlice: (slice) => set({ modeBSelectedSlice: slice }),
  setModeBSlot: (s) => set({ modeBSlot: s }),
  assignModeBCell: (slot, key) => {
    const slots = { ...get().modeBSlots, [slot]: key }
    // 绑定后自动跳到下一个未选中的槽位（按当前映射表的槽序）
    const next = slotKeysForType(get().mappingType, get().blob47Simplified).find((k) => !slots[k])
    set({ modeBSlots: slots, modeBResult: null, ...(next ? { modeBSlot: next } : {}) })
  },
  clearModeBSlots: () =>
    set({
      modeBSlots: emptySlotsForType(get().mappingType, get().blob47Simplified),
      modeBSlot: slotKeysForType(get().mappingType, get().blob47Simplified)[0],
      modeBResult: null,
    }),

  baseCanvases: {},
  setBaseCanvases: (c) => set({ baseCanvases: c }),
  overrides: {},
  setOverrides: (o) => set({ overrides: o }),

  drawTool: "pencil",
  setDrawTool: (t) => set({ drawTool: t }),
  drawTileTransparent: false,
  setDrawTileTransparent: (v) => set({ drawTileTransparent: v }),
  drawTileColorDiff: true,
  setDrawTileColorDiff: (v) => set({ drawTileColorDiff: v }),
  drawShowGrid: true,
  setDrawShowGrid: (v) => set({ drawShowGrid: v }),

  undoStack: [],
  redoStack: [],
  pushUndo: () => {
    // P2.5：像素级深拷贝快照，与活跃画布彻底隔离（画布编辑是原地改 ImageData）
    set((s) => ({
      undoStack: [...s.undoStack, deepCopyCanvases(s.baseCanvases)].slice(-50),
      redoStack: [],
    }))
  },
  undo: () => {
    const { undoStack, redoStack, baseCanvases } = get()
    if (undoStack.length === 0) return
    const prev = undoStack[undoStack.length - 1]
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, deepCopyCanvases(baseCanvases)],
      baseCanvases: prev,
    })
  },
  redo: () => {
    const { undoStack, redoStack, baseCanvases } = get()
    if (redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]
    set({
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, deepCopyCanvases(baseCanvases)],
      baseCanvases: next,
    })
  },
}))

export function getAllLibraryAssets(state: Pick<EditorState, "assets" | "dualAssets">): LibraryAsset[] {
  return [...state.assets, ...state.dualAssets]
}
