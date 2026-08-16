"use client"

import { useEditorStore } from "@/lib/store"
import { ModeAPanel } from "@/components/tile-studio/mode-a-panel"
import { ModeAPreview } from "@/components/tile-studio/mode-a-preview"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { HoverHelp } from "@/components/ui/hover-help"
import { ArrowRight } from "lucide-react"

/**
 * 参数生成路径 · 步骤 ①：参数生成与预览。
 * 左：参数面板（含实时预览 + 防误触闸门确认条）；右：大图实时预览 + 「开始」固化按钮。
 */
export function ProceduralConfigureScreen() {
  const genParams = useEditorStore((s) => s.genParams)
  const mappingType = useEditorStore((s) => s.mappingType)
  const setMappingType = useEditorStore((s) => s.setMappingType)
  const tileSize = useEditorStore((s) => s.tileSize)
  const setTileSize = useEditorStore((s) => s.setTileSize)
  const freezeParamsAndDraw = useEditorStore((s) => s.freezeParamsAndDraw)

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      {/* 顶部：映射表 / 图块大小 设置 */}
      <div className="flex shrink-0 items-center gap-4 border-b bg-sidebar px-4 py-2">
        <div className="flex items-center gap-2">
          <HoverHelp label={<span className="text-muted-foreground">映射表</span>}>
            <p className="mb-1 font-medium">映射表</p>
            <p>选择自动图块映射表：16 块（4 位四角双网格）或 47 块（8 邻居 Blob）。</p>
          </HoverHelp>
          <Select
            value={mappingType}
            onValueChange={(v) => setMappingType(v as typeof mappingType)}
          >
            <SelectTrigger className="h-8 w-[90px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="16">16 块</SelectItem>
              <SelectItem value="47">47 块</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <HoverHelp label={<span className="text-muted-foreground">图块大小</span>}>
            <p className="mb-1 font-medium">图块大小（瓦片尺寸）</p>
            <p>设定输出瓦片的像素尺寸。16 块双网格 → round(图块大小×0.875)，47 块 → 固定 32px。</p>
          </HoverHelp>
          <Input
            type="number" min={8} max={256} step={4} value={tileSize}
            onChange={(e) => { const v = Number(e.target.value); if (v >= 1) setTileSize(v) }}
            onBlur={(e) => { const v = Number(e.target.value); if (v >= 8) setTileSize(v) }}
            className="h-8 w-[80px] font-mono text-xs"
          />
          <span className="text-xs text-muted-foreground">px</span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 左：参数面板 */}
        <div className="w-[340px] shrink-0 border-r border-border">
          <ModeAPanel />
        </div>
        {/* 右：大图实时预览 + 开始 */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-checkerboard p-6">
            <div className="max-h-full max-w-full">
              <ModeAPreview tileSize={tileSize} params={genParams} mappingType={mappingType} />
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-3 border-t bg-sidebar px-4 py-3">
            <span className="text-xs text-muted-foreground">
              {tileSize}px · {mappingType === "16" ? "16" : "47"} 张图块
            </span>
            <Button size="lg" onClick={freezeParamsAndDraw}>
              开始
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}