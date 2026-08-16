"use client"

import { useRef, useState } from "react"
import { useEditorStore } from "@/lib/store"
import {
  DUAL16_SLOT_KEYS,
  DUAL16_LABELS,
  DUAL16_COLORS,
  DUAL16_GRID_POS,
  BLOB5_SLOT_KEYS,
  BLOB5_LABELS,
  BLOB5_COLORS,
  BLOB5_GRID_POS,
} from "@/lib/quadrant-stitch"
import { buildBaseFromSliceSlots } from "@/lib/slice-freeze"
import { SlicePickerInline } from "@/components/tile-studio/slice-picker-inline"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FieldLabel } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { HoverHelp } from "@/components/ui/hover-help"
import { Upload, Brush, RotateCcw } from "lucide-react"
import { toast } from "sonner"

/**
 * 槽位图标：47 模式画 3×3 九宫格，16 模式画 2×2 四象限，
 * 高亮该基础块在瓦片中的位置（两套图标与槽集一一对应，互不复用）。
 */
function SlotIcon({
  slot,
  mappingType,
  size = 18,
}: { slot: string; mappingType: "16" | "47"; size?: number }) {
  const isDual16 = mappingType === "16"
  const cells = isDual16
    ? DUAL16_GRID_POS[slot as keyof typeof DUAL16_GRID_POS]
    : BLOB5_GRID_POS[slot as keyof typeof BLOB5_GRID_POS]
  const color = isDual16
    ? DUAL16_COLORS[slot as keyof typeof DUAL16_COLORS]
    : BLOB5_COLORS[slot as keyof typeof BLOB5_COLORS]
  const n = isDual16 ? 2 : 3
  const cell = size / n
  const gap = 1
  // DUAL16_GRID_POS 的值是单元组 [col,row]，SLOT_GRID_POS 的值是元组数组；
  // 统一规范化为「坐标元组的数组」，避免把单个 number 当可迭代对象解构。
  const cellList: [number, number][] = Array.isArray((cells as unknown as unknown[])[0])
    ? (cells as unknown as [number, number][])
    : [cells as unknown as [number, number]]
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      {/* 背景网格线 */}
      <rect x={0} y={0} width={size} height={size} rx={2} fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" strokeWidth={0.5} />
      {[...Array(n)].map((_, col) =>
        [...Array(n)].map((_, row) => (
          <rect
            key={`${col}-${row}`}
            x={col * cell + gap / 2}
            y={row * cell + gap / 2}
            width={cell - gap}
            height={cell - gap}
            rx={0.5}
            fill={cellList.some(([c, r]) => c === col && r === row) ? color : "transparent"}
          />
        ))
      )}
    </svg>
  )
}

export function ModeBPanel() {
  const fileRef = useRef<HTMLInputElement>(null)
  const image = useEditorStore((s) => s.modeBImage)
  const imageSize = useEditorStore((s) => s.modeBImageSize)
  const setImage = useEditorStore((s) => s.setModeBImage)
  const gridSize = useEditorStore((s) => s.modeBGridSize)
  const setGridSize = useEditorStore((s) => s.setModeBGridSize)
  const gridSizeManual = useEditorStore((s) => s.gridSizeManual)
  const setGridSizeManual = useEditorStore((s) => s.setGridSizeManual)
  const tileSize = useEditorStore((s) => s.tileSize)
  const mappingType = useEditorStore((s) => s.mappingType)

  // 自动推算切片粒度：16 模式整块切片→tileSize，47 模式半块→固定32
  const autoGrid = mappingType === "16" ? Math.max(1, Math.round(tileSize)) : 32

  // 当前映射表对应的槽集（16 模式 5 基础块，47 模式 5 半块）
  const isDual16 = mappingType === "16"
  const slotKeys: string[] = isDual16 ? DUAL16_SLOT_KEYS : BLOB5_SLOT_KEYS
  const slotLabels: Record<string, string> = isDual16 ? DUAL16_LABELS : BLOB5_LABELS
  const slotColors: Record<string, string> = isDual16 ? DUAL16_COLORS : BLOB5_COLORS

  // 输入时只更新本地值，失焦/回车才提交到 store，避免实时重建上千格网格导致卡顿
  const [gridDrag, setGridDrag] = useState<number | null>(null)
  // 手动关闭时显示自动值；手动开启时显示用户输入/拖动值
  const displayGrid = gridSizeManual ? (gridDrag ?? gridSize) : autoGrid
  const slot = useEditorStore((s) => s.modeBSlot)
  const setSlot = useEditorStore((s) => s.setModeBSlot)
  const slots = useEditorStore((s) => s.modeBSlots)
  const clearModeBSlots = useEditorStore((s) => s.clearModeBSlots)
  const setBaseCanvases = useEditorStore((s) => s.setBaseCanvases)
  const setOverrides = useEditorStore((s) => s.setOverrides)
  const setBaseDirty = useEditorStore((s) => s.setBaseDirty)
  const finishSliceAndDraw = useEditorStore((s) => s.finishSliceAndDraw)

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        setImage(reader.result as string, { w: img.width, h: img.height })
        // 切换图片时 store 已自动清空槽位，这里激活第一个槽位
        setSlot(slotKeys[0])
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  // 固化像素：仅当全部槽位已绑定（16 模式 5 基础块 / 47 模式 5 半块）；47 完整 14 槽已移除
  const canFreeze = !!image && slotKeys.every((k) => slots[k])

  /** 把当前绑定的 5 块槽位素材提取为基础像素块并写入中间画布 */
  async function handleFreeze() {
    if (!image || !imageSize) return
    const missing = slotKeys.filter((k) => !slots[k])
    if (missing.length > 0) {
      toast.error("尚有槽位未绑定", { description: `缺少：${missing.map((m) => slotLabels[m]).join("、")}` })
      return
    }
    try {
      const base = await buildBaseFromSliceSlots({ image, gridSize, slots, slotKeys, mappingType, tileSize })
      setBaseCanvases(base)
      setOverrides({}) // 固化时清空旧的单格微调
      // 切片固化的像素属于源素材：标脏防止参数实时生成覆写
      setBaseDirty(true)
      // 递进式流程：固化完成后自动进入手绘界面
      finishSliceAndDraw()
      toast.success("已固化为像素", {
        description: `${slotKeys.length} 个基础块已写入画布，进入手绘细化`,
      })
    } catch (err) {
      toast.error("固化失败", { description: err instanceof Error ? err.message : "未知错误" })
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 顶部紧凑控制区 */}
      <div className="shrink-0 space-y-2 border-b border-border bg-sidebar p-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
          <Upload data-icon="inline-start" />
          {image ? "更换图片" : "导入图片"}
        </Button>

        {/* 切块大小 + 固化为像素（横向并列） */}
        <div className="flex items-center gap-2">
          <FieldLabel className="shrink-0">
            <HoverHelp label="切块大小">
              <p className="mb-1 font-medium">切块大小（源图网格）</p>
              <p>
                把导入图片按此像素大小切成方格，下方网格即为切片大小。默认跟随「图块大小」自动推算：
                16 块双网格 → 图块大小，47 块 → 固定 32。开启右侧开关可手动覆盖。
              </p>
            </HoverHelp>
            切块大小
          </FieldLabel>
          <Input
            type="number"
            min={4}
            max={256}
            step={1}
            value={displayGrid}
            disabled={!gridSizeManual}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (v >= 1) setGridDrag(v)
            }}
            onBlur={(e) => {
              const v = Number(e.target.value)
              if (v >= 1) { setGridSize(v); setGridDrag(null) }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const v = Number((e.target as HTMLInputElement).value)
                if (v >= 1) { setGridSize(v); setGridDrag(null) }
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            className={`h-8 w-16 font-mono text-xs ${!gridSizeManual ? "cursor-not-allowed opacity-60" : ""}`}
          />
          <span className="text-[11px] text-muted-foreground">px</span>
          <Switch
            checked={gridSizeManual}
            onCheckedChange={(checked) => {
              if (checked) {
                setGridSize(autoGrid)
                setGridSizeManual(true)
              } else {
                setGridSize(autoGrid)
                setGridSizeManual(false)
              }
              setGridDrag(null)
            }}
            aria-label="手动切换切片粒度"
          />
          {!gridSizeManual && <span className="text-[10px] text-muted-foreground">自动</span>}
          <div className="ml-auto">
            <Button
              size="xs"
              disabled={!canFreeze}
              onClick={handleFreeze}
              title={canFreeze ? undefined : "需绑定全部 5 块基础块后才能固化为像素"}
            >
              <Brush data-icon="inline-start" />
              固化为像素
            </Button>
          </div>
        </div>

        {/* 槽位选择：横向排版 */}
        <div className="flex flex-wrap items-center gap-1">
          {slotKeys.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setSlot(k)}
              className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] transition-colors ${
                slot === k ? "" : "border-border hover:bg-accent"
              }`}
              style={slot === k ? { borderColor: slotColors[k], backgroundColor: `${slotColors[k]}22` } : undefined}
            >
              <SlotIcon slot={k} mappingType={mappingType} size={16} />
              {slotLabels[k]}
              {slots[k] && <span className="size-1.5 rounded-full bg-emerald-400" title="已绑定" />}
            </button>
          ))}
          <button
            type="button"
            onClick={clearModeBSlots}
            className="ml-auto flex items-center gap-1 rounded-md border border-dashed border-muted-foreground/40 px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
            title="清空当前所有槽位选择"
          >
            <RotateCcw data-icon="inline-start" />
            清空选择
          </button>
        </div>
      </div>

      {/* 网格拾取内联视图（占满剩余区域） */}
      <div className="min-h-0 flex-1">
        <SlicePickerInline />
      </div>
    </div>
  )
}