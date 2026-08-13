"use client"

import { useRef, useState } from "react"
import { useEditorStore } from "@/lib/store"
import {
  generateQuadrantStitch,
  SLOT_COLORS,
  SLOT_GRID_POS,
  SLOT_LABELS,
  SLOT_ORDER,
  DUAL16_SLOT_KEYS,
  DUAL16_LABELS,
  DUAL16_COLORS,
  DUAL16_GRID_POS,
  BLOB5_SLOT_KEYS,
  BLOB5_LABELS,
  BLOB5_COLORS,
  BLOB5_GRID_POS,
} from "@/lib/quadrant-stitch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { HoverHelp } from "@/components/ui/hover-help"
import { Upload, Wand2, X, Layers } from "lucide-react"
import { toast } from "sonner"

/**
 * 槽位图标：47 模式画 3×3 九宫格，16 模式画 2×2 四象限，
 * 高亮该基础块在瓦片中的位置（两套图标与槽集一一对应，互不复用）。
 */
function SlotIcon({
  slot,
  mappingType,
  simplified = false,
  size = 18,
}: { slot: string; mappingType: "16" | "47"; simplified?: boolean; size?: number }) {
  const isDual16 = mappingType === "16"
  const isSimple47 = !isDual16 && simplified
  const cells = isDual16
    ? DUAL16_GRID_POS[slot as keyof typeof DUAL16_GRID_POS]
    : isSimple47
      ? BLOB5_GRID_POS[slot as keyof typeof BLOB5_GRID_POS]
      : SLOT_GRID_POS[slot as keyof typeof SLOT_GRID_POS]
  const color = isDual16
    ? DUAL16_COLORS[slot as keyof typeof DUAL16_COLORS]
    : isSimple47
      ? BLOB5_COLORS[slot as keyof typeof BLOB5_COLORS]
      : SLOT_COLORS[slot as keyof typeof SLOT_COLORS]
  const n = isDual16 ? 2 : 3
  const cell = size / n
  const gap = 1
  // DUAL16_GRID_POS 的值是单元组 [col,row]，SLOT_GRID_POS 的值是元组数组；
  // 统一规范化为“坐标元组的数组”，避免把单个 number 当可迭代对象解构。
  // DUAL16_GRID_POS 的值是单元组 [col,row]，SLOT_GRID_POS 的值是元组数组；
  // 统一规范化为“坐标元组的数组”，避免把单个 number 当可迭代对象解构。
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
            fill={
              cellList.some(([c, r]) => c === col && r === row)
                ? color
                : "transparent"
            }
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
  const simplified = useEditorStore((s) => s.blob47Simplified)
  const setSimplified = useEditorStore((s) => s.setBlob47Simplified)

  // 自动推算切片粒度：16 模式整块切片→tileSize，47 模式半块→固定32
  const autoGrid = mappingType === "16" ? Math.max(1, Math.round(tileSize)) : 32

  // 当前映射表对应的槽集（16 模式 5 基础块，47 模式 13 槽 / 简化后 5 半块）
  const isDual16 = mappingType === "16"
  const isSimple47 = !isDual16 && simplified
  const slotKeys: string[] = isDual16
    ? DUAL16_SLOT_KEYS
    : isSimple47
      ? BLOB5_SLOT_KEYS
      : SLOT_ORDER
  const slotLabels: Record<string, string> = isDual16
    ? DUAL16_LABELS
    : isSimple47
      ? BLOB5_LABELS
      : SLOT_LABELS
  const slotColors: Record<string, string> = isDual16
    ? DUAL16_COLORS
    : isSimple47
      ? BLOB5_COLORS
      : SLOT_COLORS

  // 输入时只更新本地值，失焦/回车才提交到 store，避免实时重建上千格网格导致卡顿
  const [gridDrag, setGridDrag] = useState<number | null>(null)
  // 手动关闭时显示自动值；手动开启时显示用户输入/拖动值
  const displayGrid = gridSizeManual ? (gridDrag ?? gridSize) : autoGrid
  const slot = useEditorStore((s) => s.modeBSlot)
  const setSlot = useEditorStore((s) => s.setModeBSlot)
  const slots = useEditorStore((s) => s.modeBSlots)
  const clearSlots = useEditorStore((s) => s.clearModeBSlots)
  const setModeBResult = useEditorStore((s) => s.setModeBResult)

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        setImage(reader.result as string, { w: img.width, h: img.height })
        // 导入图片后自动选中第一个未绑定的槽位
        const firstEmpty = slotKeys.find((k) => !slots[k])
        if (firstEmpty) setSlot(firstEmpty)
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  const pickedCount = slotKeys.filter((k) => slots[k]).length

  async function handleGenerate() {
    if (!image || !imageSize) return
    const missing = slotKeys.filter((k) => !slots[k])
    if (missing.length > 0) {
      toast.error("尚有槽位未绑定", { description: `缺少：${missing.map((m) => slotLabels[m]).join("、")}` })
      return
    }
    try {
      const result = await generateQuadrantStitch(image, gridSize, slots, mappingType, tileSize, simplified)
      setModeBResult(result)
      toast.success(`已生成 ${result.tiles.size} 种图块模板`, {
        description: `${mappingType === "47" ? "47-tile (Blob)" : "16-tile (4-bit)"} · 瓦片 ${tileSize}px · 画布 ${result.width}×${result.height}px`,
      })
    } catch (err) {
      toast.error("生成失败", { description: err instanceof Error ? err.message : "未知错误" })
    }
  }

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-4">
        <div>
          <h2 className="flex items-center font-sans text-sm font-semibold text-foreground">
            <HoverHelp label="五块切片算法">
              <p className="mb-1 font-medium">五块切片算法</p>
              <p>
                将一张源图按网格切成小块，把 13 个基础槽位（4 外角 / 4 内角 / 4 边缘 / 中心 / 背景）
                分别绑定到源图方块上。生成时，算法按 4 个象限（左上/右上/左下/右下）从已绑定的槽位中
                取对应的角/边/中心切片，自动拼合出 16 种（4 位表示四角）或 47 种（8 邻居 Blob）图块模板。
              </p>
            </HoverHelp>
          </h2>
        </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <Button variant="outline" onClick={() => fileRef.current?.click()}>
        <Upload data-icon="inline-start" />
        {image ? "更换图片" : "导入图片"}
      </Button>

      {image && (
        <FieldGroup>
          <Field>
            <FieldLabel>
              <HoverHelp label="切片大小">
                <p className="mb-1 font-medium">切片大小（源图网格）</p>
                <p>
                  把导入图片按此像素大小切成方格，中间网格即为切片大小。默认跟随「图块大小」自动推算：
                  16 块双网格 → 图块大小（图块大小32→32），47 块 → 固定 32。开启右侧开关可手动覆盖。
                </p>
              </HoverHelp>
            </FieldLabel>
            <div className="flex items-center gap-2">
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
                className={`h-8 w-[90px] font-mono text-xs ${!gridSizeManual ? "cursor-not-allowed opacity-60" : ""}`}
              />
              <span className="text-xs text-muted-foreground">px</span>
              <Switch
                checked={gridSizeManual}
                onCheckedChange={(checked) => {
                  if (checked) {
                    // 开启时用当前自动值作为初始值
                    setGridSize(autoGrid)
                    setGridSizeManual(true)
                  } else {
                    // 关闭时恢复自动值
                    setGridSize(autoGrid)
                    setGridSizeManual(false)
                  }
                  setGridDrag(null)
                }}
                aria-label="手动切换切片粒度"
              />
              {!gridSizeManual && (
                <span className="text-[10px] text-muted-foreground">自动</span>
              )}
            </div>
          </Field>

          {mappingType === "47" && (
            <Field>
              <FieldLabel>
                <HoverHelp label="简化槽位（5 块）">
                  <p className="mb-1 font-medium">简化模式</p>
                  <p>
                    13 个槽在对称性下其实只有 5 类形状：4 个外角是同一份美术的镜像，4 个内角同理，
                    4 个边缘是同一份美术的旋转。开启后只需绑定「左上外角 / 左上内角 / 上边缘 /
                    全实中心 / 空背景」5 块，其余 8 槽由程序自动翻转、旋转推导。
                  </p>
                  <p className="mt-1 text-amber-500">
                    注意：若素材非对称（单侧高光、朝向性草叶、投影等），镜像后会穿帮，
                    此时请关闭本开关改用完整 13 槽。
                  </p>
                </HoverHelp>
              </FieldLabel>
              <div className="flex items-center gap-2">
                <Switch
                  checked={simplified}
                  onCheckedChange={setSimplified}
                  aria-label="切换 47 模式简化槽位"
                />
              </div>
            </Field>
          )}

          <Field>
            <div className="flex items-center gap-1.5">
              <Layers className="size-3.5 text-muted-foreground" />
              <FieldLabel>
                <HoverHelp label="选择槽位 → 到中间预览区点选 1 个方块">
                  <p className="mb-1 font-medium">槽位（Slot）</p>
                  <p>
                    槽位是拼接所需的「基础形状构件」：4 个外角、4 个内角、4 个边缘、1 个全实中心、
                    1 个空背景，共 14 个。每个槽位需从源图绑定 1 格切片；算法在拼合图块时按象限
                    从对应槽位取片。绑定顺序不影响结果，但 14 个槽位需全部绑定才能生成。
                  </p>
                </HoverHelp>
              </FieldLabel>
            </div>
            <ToggleGroup
              value={[slot]}
              onValueChange={(v) => v[0] && setSlot(v[0])}
              variant="outline"
              className="grid grid-cols-1 gap-1.5 w-full"
            >
              {slotKeys.map((k) => {
                const picked = slots[k]
                return (
                  <ToggleGroupItem
                    key={k}
                    value={k}
                    className="flex items-center justify-start gap-2 px-2.5 text-xs"
                    style={slot === k ? { borderColor: slotColors[k] } : undefined}
                  >
                    <SlotIcon slot={k} mappingType={mappingType} simplified={simplified} />
                    {slotLabels[k]}
                    {picked ? (
                      <span className="ml-auto rounded-full bg-emerald-500/20 px-1.5 text-[10px] text-emerald-600">已选</span>
                    ) : (
                      <span className="ml-auto rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">待选</span>
                    )}
                  </ToggleGroupItem>
                )
              })}
            </ToggleGroup>
          </Field>
        </FieldGroup>
      )}

      {pickedCount > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          已绑定 {pickedCount}/{slotKeys.length} 槽位
          <Button size="xs" variant="ghost" className="ml-auto" onClick={clearSlots}>
            <X data-icon="inline-start" /> 清空
          </Button>
        </div>
      )}

      <Button disabled={!image} onClick={handleGenerate} className="mt-1 w-full">
        <Wand2 data-icon="inline-start" />
        生成 {mappingType === "47" ? "47" : "16"} 种模板
      </Button>
      </div>
  )
}
