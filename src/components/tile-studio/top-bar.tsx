"use client"

import { useState } from "react"
import { useEditorStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TooltipProvider } from "@/components/ui/tooltip"
import { HoverHelp } from "@/components/ui/hover-help"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { SponsorDialog } from "@/components/tile-studio/sponsor-dialog"
import { HelpDialog } from "@/components/tile-studio/help-dialog"
import {
  Minus,
  Square,
  X,
  CircleQuestionMark,
} from "lucide-react"

// 仅在 Tauri 桌面端暴露窗口控制；浏览器下为 null
const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
const appWindow = isTauri ? getCurrentWindow() : null

export function TopBar({ onExport }: { onExport: () => void }) {
  const [sponsorOpen, setSponsorOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const mappingType = useEditorStore((s) => s.mappingType)
  const setMappingType = useEditorStore((s) => s.setMappingType)
  const tileSize = useEditorStore((s) => s.tileSize)
  const setTileSize = useEditorStore((s) => s.setTileSize)

  // 本地暂存：输入时仅更新本地值，失焦/回车才提交，避免每次按键重建上千格网格导致卡顿
  const [tileInput, setTileInput] = useState<number | null>(null)
  const displayTile = tileInput ?? tileSize
  const commitTile = (v: number) => {
    if (v >= 8) { setTileSize(v); setTileInput(null) }
  }

  return (
    <TooltipProvider>
      <div
        className="flex items-center gap-4 border-b bg-background px-4 py-2 text-sm"
        {...(appWindow ? ({ "data-tauri-drag-region": true } as React.HTMLAttributes<HTMLDivElement>) : {})}
      >
        {/* 左上角：应用图标 + 软件名称整体作为赞助按钮（点击打开赞助界面） */}
        <Button
          variant="ghost"
          className="flex h-9 shrink-0 items-center gap-2 rounded-md px-2"
          onClick={() => setSponsorOpen(true)}
          aria-label="赞助作者"
          title="赞助作者"
        >
          <img src="./autotile-icon.ico" alt="" className="h-5 w-5 rounded-sm" draggable={false} />
          <span className="text-sm font-semibold tracking-tight">瓦片锻造工坊</span>
        </Button>

        <div
          className="flex items-center gap-2"
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

        {/* 弹性拖拽区：占据顶条剩余空白，实现整行拖动 */}
        {appWindow && (
          <div
            className="drag-spacer flex-1 self-stretch"
            {...({ "data-tauri-drag-region": true } as React.HTMLAttributes<HTMLDivElement>)}
          />
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setHelpOpen(true)} aria-label="使用说明" title="使用说明">
            <CircleQuestionMark className="size-4" />
          </Button>
          <Button variant="default" size="sm" onClick={onExport} className="bg-amber-500 text-amber-950 hover:bg-amber-400">
            导出
          </Button>

          {/* 桌面端窗口控制按钮 */}
          {appWindow && (
            <div className="flex items-center">
              <button
                type="button"
                aria-label="最小化"
                onClick={() => appWindow.minimize()}
                className="flex h-7 w-9 items-center justify-center rounded-l-md border border-l border-y text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="最大化"
                onClick={() => appWindow.toggleMaximize()}
                className="flex h-7 w-9 items-center justify-center border-y text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Square className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => appWindow.close()}
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
