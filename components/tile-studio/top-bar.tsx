"use client"

import { useState } from "react"
import { useEditorStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { HoverHelp } from "@/components/ui/hover-help"
import { SponsorDialog } from "@/components/tile-studio/sponsor-dialog"
import { HelpDialog } from "@/components/tile-studio/help-dialog"
import {
  Minus,
  Square,
  X,
  Pencil,
  Eraser,
  Pipette,
  PaintBucket,
  SquareDashed,
  Slash,
  Infinity as InfinityIcon,
  Grid3x3,
  Contrast,
  Undo2,
  Redo2,
  CircleQuestionMark,
} from "lucide-react"
import type { DrawTool, SourceMode } from "@/lib/types"

// 仅在 Electron 桌面端暴露窗口控制；浏览器下为 undefined
const electronWindow =
  typeof window !== "undefined" ? (window as any).electronWindow : undefined

// 三入口来源模式（D2：与 AppMode 解耦）
const SOURCE_MODES = [
  { value: "procedural", label: "参数生成" },
  { value: "slice", label: "导入切片" },
  { value: "draw", label: "手绘" },
] as const

// 绘制工具箱（P1 骨架，P2 接实）
const DRAW_TOOLS: { value: DrawTool; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "pencil", label: "铅笔", icon: Pencil },
  { value: "eraser", label: "橡皮", icon: Eraser },
  { value: "picker", label: "吸管", icon: Pipette },
  { value: "fill", label: "油漆桶", icon: PaintBucket },
  { value: "rect", label: "矩形", icon: SquareDashed },
  { value: "line", label: "线条", icon: Slash },
]

export function TopBar({ onExport }: { onExport: () => void }) {
  const [sponsorOpen, setSponsorOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const sourceMode = useEditorStore((s) => s.sourceMode)
  const setSourceMode = useEditorStore((s) => s.setSourceMode)
  const mappingType = useEditorStore((s) => s.mappingType)
  const setMappingType = useEditorStore((s) => s.setMappingType)
  const blob47Simplified = useEditorStore((s) => s.blob47Simplified)
  const tileSize = useEditorStore((s) => s.tileSize)
  const setTileSize = useEditorStore((s) => s.setTileSize)
  const baseCanvases = useEditorStore((s) => s.baseCanvases)
  // 手绘标签仅在「固化为像素」生成数据后才可点击
  const hasBase = Object.keys(baseCanvases).length > 0

  // 绘制工具箱状态（P1 骨架）
  const drawTool = useEditorStore((s) => s.drawTool)
  const setDrawTool = useEditorStore((s) => s.setDrawTool)
  const drawTileTransparent = useEditorStore((s) => s.drawTileTransparent)
  const setDrawTileTransparent = useEditorStore((s) => s.setDrawTileTransparent)
  const drawTileColorDiff = useEditorStore((s) => s.drawTileColorDiff)
  const setDrawTileColorDiff = useEditorStore((s) => s.setDrawTileColorDiff)
  const drawShowGrid = useEditorStore((s) => s.drawShowGrid)
  const setDrawShowGrid = useEditorStore((s) => s.setDrawShowGrid)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)
  const canUndo = useEditorStore((s) => s.undoStack.length > 0)
  const canRedo = useEditorStore((s) => s.redoStack.length > 0)

  // 本地暂存：输入时仅更新本地值，失焦/回车才提交，避免每次按键重建上千格网格导致卡顿
  const [tileInput, setTileInput] = useState<number | null>(null)
  const displayTile = tileInput ?? tileSize
  const commitTile = (v: number) => {
    if (v >= 8) { setTileSize(v); setTileInput(null) }
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-4 border-b bg-background px-4 py-2 text-sm">
        {/* 左上角：应用图标 + 软件名称整体作为赞助按钮（点击打开赞助界面） */}
        <Button
          variant="ghost"
          className="flex h-9 shrink-0 items-center gap-2 rounded-md px-2"
          onClick={() => setSponsorOpen(true)}
          aria-label="赞助作者"
          title="赞助作者"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <img src="./autotile-icon.ico" alt="" className="h-5 w-5 rounded-sm" draggable={false} />
          <span className="text-sm font-semibold tracking-tight">瓦片锻造工坊</span>
        </Button>

        <div
          className="flex items-center gap-2"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <Tabs
            value={sourceMode}
            onValueChange={(v) => {
              setSourceMode(v as SourceMode)
            }}
          >
            <TabsList>
              {SOURCE_MODES.map((m) => {
                const disabled = m.value === "draw" && !hasBase
                const tab = (
                  <TabsTrigger key={m.value} value={m.value} disabled={disabled}>
                    {m.label}
                  </TabsTrigger>
                )
                // 手绘标签呈灰色时，悬停显示操作说明（禁用元素不触发事件，用 span 包裹）
                if (!disabled) return tab
                return (
                  <Tooltip key={m.value}>
                    <TooltipTrigger render={<span className="inline-flex" />}>{tab}</TooltipTrigger>
                    <TooltipContent>请先在「参数生成」点击「固化为像素」生成数据</TooltipContent>
                  </Tooltip>
                )
              })}
            </TabsList>
          </Tabs>
        </div>

        <div
          className="flex items-center gap-2"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <HoverHelp label={<span className="text-muted-foreground">映射表</span>}>
            <p className="mb-1 font-medium">映射表</p>
            <p>选择自动图块映射表：16 块（4 位四角双网格）或 47 块（8 邻居 Blob）。</p>
          </HoverHelp>
          <Select
            value={mappingType}
            onValueChange={(v) => {
              setMappingType(v as typeof mappingType)
            }}
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

        <div
          className="flex items-center gap-2"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <HoverHelp label={<span className="text-muted-foreground">图块大小</span>}>
            <p className="mb-1 font-medium">图块大小（瓦片尺寸）</p>
            <p>
              设定输出瓦片的像素尺寸。切片大小（中间网格）会自动推算：
              16 块双网格 → round(图块大小×0.875)（32→28px），47 块 → 固定 32px。
            </p>
          </HoverHelp>
          <Input
            type="number"
            min={8}
            max={256}
            step={4}
            value={displayTile}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (v >= 1) setTileInput(v)
            }}
            onBlur={(e) => {
              const v = Number(e.target.value)
              commitTile(v)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const v = Number((e.target as HTMLInputElement).value)
                commitTile(v)
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            className="h-8 w-[80px] font-mono text-xs"
          />
          <span className="text-xs text-muted-foreground">px</span>
        </div>

        {/* 绘制工具箱骨架：仅在手绘模式显示（P1 骨架，P2 接实） */}
        {sourceMode === "draw" && (
          <div
            className="flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            {DRAW_TOOLS.map((t) => (
              <Tooltip key={t.value}>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant={drawTool === t.value ? "secondary" : "ghost"}
                      onClick={() => {
                        setDrawTool(t.value)
                      }}
                      aria-label={t.label}
                      title={t.label}
                    />
                  }
                >
                  <t.icon className="size-4" />
                </TooltipTrigger>
                <TooltipContent>{t.label}</TooltipContent>
              </Tooltip>
            ))}
            <span className="mx-0.5 h-4 w-px bg-border" />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant={drawTileTransparent ? "secondary" : "ghost"}
                    onClick={() => setDrawTileTransparent(!drawTileTransparent)}
                    aria-label="∞ 通透绘制"
                    title="∞ 通透绘制"
                  />
                }
              >
                <InfinityIcon className="size-4" />
              </TooltipTrigger>
              <TooltipContent>∞ 通透绘制（越界回绕）</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant={drawTileColorDiff ? "secondary" : "ghost"}
                    onClick={() => setDrawTileColorDiff(!drawTileColorDiff)}
                    aria-label="色差显示"
                    title="色差显示"
                  />
                }
              >
                <Contrast className="size-4" />
              </TooltipTrigger>
              <TooltipContent>色差显示（周围副本半透明偏暗）</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant={drawShowGrid ? "secondary" : "ghost"}
                    onClick={() => setDrawShowGrid(!drawShowGrid)}
                    aria-label="网格显示"
                    title="网格显示"
                  />
                }
              >
                <Grid3x3 className="size-4" />
              </TooltipTrigger>
              <TooltipContent>像素网格显示</TooltipContent>
            </Tooltip>
            <span className="mx-0.5 h-4 w-px bg-border" />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={undo}
                    disabled={!canUndo}
                    aria-label="撤销"
                    title="撤销"
                  />
                }
              >
                <Undo2 className="size-4" />
              </TooltipTrigger>
              <TooltipContent>撤销</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={redo}
                    disabled={!canRedo}
                    aria-label="重做"
                    title="重做"
                  />
                }
              >
                <Redo2 className="size-4" />
              </TooltipTrigger>
              <TooltipContent>重做</TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* 弹性拖拽区：占据顶条剩余空白，实现整行拖动 */}
        {electronWindow && (
          <div
            className="drag-spacer flex-1 self-stretch"
            style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
          />
        )}

        <div
          className="ml-auto flex items-center gap-2"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setHelpOpen(true)} aria-label="使用说明" title="使用说明">
            <CircleQuestionMark className="size-4" />
          </Button>
          <Button variant="default" size="sm" onClick={onExport} className="bg-amber-500 text-amber-950 hover:bg-amber-400">
            导出
          </Button>

          {/* 桌面端窗口控制按钮 */}
          {electronWindow && (
            <div
              className="flex items-center"
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
              <button
                type="button"
                aria-label="最小化"
                onClick={() => electronWindow.minimize()}
                className="flex h-7 w-9 items-center justify-center rounded-l-md border border-l border-y text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="最大化"
                onClick={() => electronWindow.toggleMaximize()}
                className="flex h-7 w-9 items-center justify-center border-y text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Square className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => electronWindow.close()}
                className="flex h-7 w-9 items-center justify-center rounded-r-md border border-r border-y text-muted-foreground hover:bg-red-500 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
      <SponsorDialog open={sponsorOpen} onOpenChange={setSponsorOpen} />
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </TooltipProvider>
  )
}
